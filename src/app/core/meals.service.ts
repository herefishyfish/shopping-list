import { Injectable, effect, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { db } from './firebase';
import { ListsService } from './lists.service';
import { isMatch, orderWeekId, toMeal, type MealIdea, type MealVote } from './meals';
import { ShoppingList } from './models';
import { ReminderService } from './reminder.service';
import { track } from './telemetry';

type Unsubscribe = () => void;

export interface MealWeek {
  weekId: string;
  /** The plan document exists. Meals can still show if an admin wrote only the subcollection. */
  exists: boolean;
  meals: MealIdea[];
}

/**
 * Reads `lists/{listId}/mealPlans/{weekId}` (this Wednesday in Perth) and writes votes.
 * Meal documents themselves are created outside the app. When every current member has
 * voted yes, the ingredients are merged onto the list.
 */
@Injectable({ providedIn: 'root' })
export class MealsService {
  private readonly auth = inject(AuthService);
  private readonly lists = inject(ListsService);
  private readonly reminders = inject(ReminderService);

  private reminderUnsub: Unsubscribe | null = null;
  private reminderKey = '';
  private readonly applying = new Set<string>();
  private tail: Promise<unknown> = Promise.resolve();

  constructor() {
    effect(() => {
      if (!this.auth.user()) this.stopReminder();
    });
  }

  watch(listId: string, weekId: string, next: (week: MealWeek) => void): Unsubscribe {
    const planRef = db().collection('lists').doc(listId).collection('mealPlans').doc(weekId);
    let exists = false;
    let meals: MealIdea[] = [];
    let planReady = false;
    let mealsReady = false;
    const emit = () => {
      if (planReady && mealsReady) next({ weekId, exists, meals });
    };
    const unsubPlan = planRef.onSnapshot(
      (snap) => {
        exists = !!snap.exists;
        planReady = true;
        emit();
      },
      (err) => {
        console.error('[meals] plan listener failed', err);
        exists = false;
        planReady = true;
        emit();
      },
    );
    const unsubMeals = planRef.collection('meals').onSnapshot(
      (snap) => {
        meals = snap.docs.map((d) => toMeal(d.id, d.data()));
        meals.sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
        mealsReady = true;
        emit();
      },
      (err) => {
        console.error('[meals] listener failed', err);
        meals = [];
        mealsReady = true;
        emit();
      },
    );
    return () => {
      unsubPlan();
      unsubMeals();
    };
  }

  vote(listId: string, weekId: string, mealId: string, choice: MealVote) {
    return db()
      .collection('lists')
      .doc(listId)
      .collection('mealPlans')
      .doc(weekId)
      .collection('meals')
      .doc(mealId)
      .update({ [`votes.${this.auth.uid}`]: choice })
      .then((result) => {
        track('meal_voted', { choice });
        return result;
      });
  }

  /** Queue ingredient writes for meals that just became a match. Safe to call on every snapshot. */
  considerMatches(list: ShoppingList, weekId: string, meals: readonly MealIdea[]): Promise<void> {
    const jobs: Promise<unknown>[] = [];
    for (const meal of meals) {
      if (meal.appliedAt || this.applying.has(meal.id) || !isMatch(meal.votes, list.memberIds)) continue;
      this.applying.add(meal.id);
      jobs.push(this.enqueue(() => this.lists.applyAgreedMeal(list, weekId, meal.id).finally(() => this.applying.delete(meal.id))));
    }
    return Promise.all(jobs).then(() => undefined);
  }

  /** Listen for this week's meals and nudge once, if notification permission is already granted. */
  armReminder(list: ShoppingList) {
    const weekId = orderWeekId();
    const key = `${list.id}:${weekId}`;
    if (this.reminderKey === key) return;
    this.stopReminder();
    this.reminderKey = key;
    void this.reminders.ensureScheduled();
    this.reminderUnsub = db()
      .collection('lists')
      .doc(list.id)
      .collection('mealPlans')
      .doc(weekId)
      .collection('meals')
      .onSnapshot(
        (snap) => {
          if (snap.docs.length) void this.reminders.notifyMealPlan(list.id, weekId, list.name);
        },
        (err) => console.error('[meals] reminder listener failed', err),
      );
  }

  private stopReminder() {
    this.reminderUnsub?.();
    this.reminderUnsub = null;
    this.reminderKey = '';
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const run = this.tail.then(work, work);
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}
