import { Component, DestroyRef, NO_ERRORS_SCHEMA, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { NativeScriptCommonModule, RouterExtensions } from '@nativescript/angular';
import { ApplicationSettings, GestureStateTypes, PanGestureEventData } from '@nativescript/core';
import { MealWeek, MealsService } from '../../core/meals.service';
import { AuthService } from '../../core/auth.service';
import { ListsService } from '../../core/lists.service';
import { deckMeals, formatAud, formatOrderDay, groupMeals, orderWeekId, voteLines, voteSummary, type MealIdea, type MealVote } from '../../core/meals';
import { ShoppingList } from '../../core/models';
import { PageInsetsDirective } from '../../core/page-insets.directive';
import { ReminderService } from '../../core/reminder.service';
import { UiService } from '../../core/ui.service';

const VEG_KEY = 'mealsVegetarianOnly';
const SWIPE_THRESHOLD = 110;

@Component({
  selector: 'meals-page',
  templateUrl: './meals.page.html',
  styleUrls: ['./meals.page.scss'],
  imports: [PageInsetsDirective, NativeScriptCommonModule],
  schemas: [NO_ERRORS_SCHEMA],
})
export class MealsPage {
  private readonly lists = inject(ListsService);
  private readonly mealsApi = inject(MealsService);
  private readonly auth = inject(AuthService);
  private readonly ui = inject(UiService);
  private readonly router = inject(RouterExtensions);
  private readonly reminders = inject(ReminderService);

  readonly weekId = orderWeekId();
  readonly weekTitle = `Order day · ${formatOrderDay(this.weekId)}`;
  readonly list = signal<ShoppingList | null | undefined>(undefined);
  readonly week = signal<MealWeek | null>(null);
  readonly vegOnly = signal(ApplicationSettings.getBoolean(VEG_KEY, false));
  readonly dragX = signal(0);
  readonly busy = signal(false);
  private readonly optimistic = signal<Record<string, MealVote>>({});
  private announced = false;
  private readonly announcedIds = new Set<string>();
  private told = false;

  readonly myUid = computed(() => this.auth.user()?.uid ?? '');
  readonly memberIds = computed(() => this.list()?.memberIds ?? []);
  readonly names = computed(() => {
    const names: Record<string, string> = {};
    for (const [uid, member] of Object.entries(this.list()?.members ?? {})) names[uid] = member.name?.split(' ')[0] || 'Partner';
    return names;
  });
  readonly meals = computed(() => {
    const mine = this.myUid();
    const extra = this.optimistic();
    return (this.week()?.meals ?? []).map((meal) => {
      const choice = extra[meal.id];
      if (!choice || meal.votes[mine] === choice) return meal;
      return { ...meal, votes: { ...meal.votes, [mine]: choice } };
    });
  });
  readonly visibleMeals = computed(() => (this.vegOnly() ? this.meals().filter((meal) => meal.vegetarian) : this.meals()));
  readonly hiddenCount = computed(() => this.meals().length - this.visibleMeals().length);
  readonly deck = computed(() => deckMeals(this.visibleMeals(), this.memberIds(), this.myUid(), false));
  readonly front = computed(() => this.deck()[0] ?? null);
  readonly peek = computed(() => this.deck().length > 1);
  readonly groups = computed(() => {
    const grouped = groupMeals(this.visibleMeals(), this.memberIds());
    return [
      { key: 'agreed', label: 'Agreed', meals: grouped.agreed },
      { key: 'pending', label: 'Pending', meals: grouped.pending },
      { key: 'rejected', label: 'No', meals: grouped.rejected },
    ];
  });
  readonly countsLine = computed(() => {
    const groups = this.groups();
    const count = (key: string) => groups.find((group) => group.key === key)?.meals.length ?? 0;
    return `${count('agreed')} agreed · ${count('pending')} pending · ${count('rejected')} no`;
  });
  readonly needsPartner = computed(() => (this.list()?.memberIds.length ?? 0) < 2);
  readonly tilt = computed(() => Math.max(-12, Math.min(12, this.dragX() / 18)));
  readonly emptyMessage = computed(() => {
    if (this.list() === undefined || !this.week()) return 'Loading meals…';
    const week = this.week()!;
    if (!week.exists && !week.meals.length) return `No meal ideas for ${formatOrderDay(this.weekId)} yet. They'll show up here once they're added.`;
    if (this.vegOnly() && this.hiddenCount() && !this.deck().length) return 'No vegetarian meals left to swipe. Turn the filter off to see the rest.';
    return "You're up to date. Anything you both want lands on the shopping list.";
  });

  constructor() {
    const id = inject(ActivatedRoute).snapshot.paramMap.get('id')!;
    this.lists.setCurrent(id);
    void this.reminders.ensureScheduled();
    const unsubList = this.lists.watchList(id, (list) => {
      this.list.set(list);
      if (!list) {
        this.ui.toast('This list is no longer available');
        this.router.navigate(['/start'], { clearHistory: true });
        return;
      }
      this.mealsApi.armReminder(list);
      const week = this.week();
      if (week) this.sync(list, week);
    });
    const unsubMeals = this.mealsApi.watch(id, this.weekId, (week) => {
      this.noteApplied(week.meals);
      this.dropOptimistic(week.meals);
      this.week.set(week);
      const list = this.list();
      if (list) this.sync(list, week);
    });
    inject(DestroyRef).onDestroy(() => {
      unsubList();
      unsubMeals();
    });
  }

  toggleVeg() {
    this.vegOnly.update((on) => !on);
    ApplicationSettings.setBoolean(VEG_KEY, this.vegOnly());
  }

  onPan(event: PanGestureEventData) {
    if (this.busy() || !this.front()) return;
    if (event.state === GestureStateTypes.began || event.state === GestureStateTypes.changed) {
      this.dragX.set(event.deltaX);
      return;
    }
    if (event.state === GestureStateTypes.ended && Math.abs(event.deltaX) > SWIPE_THRESHOLD && Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
      const meal = this.front();
      if (meal) void this.vote(meal, event.deltaX > 0 ? 'yes' : 'no');
      else this.dragX.set(0);
      return;
    }
    this.dragX.set(0);
  }

  async vote(meal: MealIdea, choice: MealVote) {
    const list = this.list();
    if (!list || this.busy() || meal.appliedAt) return;
    if (meal.votes[this.myUid()] === choice) return;
    const animate = this.front()?.id === meal.id;
    this.busy.set(true);
    if (animate) this.dragX.set(choice === 'yes' ? 480 : -480);
    if (animate) await wait(140);
    this.optimistic.update((cur) => ({ ...cur, [meal.id]: choice }));
    this.dragX.set(0);
    try {
      await this.mealsApi.vote(list.id, this.weekId, meal.id, choice);
    } catch (e) {
      this.optimistic.update((cur) => {
        const next = { ...cur };
        delete next[meal.id];
        return next;
      });
      this.ui.error('Could not save your vote', e);
    } finally {
      this.busy.set(false);
    }
  }

  lines(meal: MealIdea) {
    return voteLines(meal, this.memberIds(), this.names(), this.myUid());
  }

  summary(meal: MealIdea) {
    return voteSummary(this.lines(meal));
  }

  cost(meal: MealIdea) {
    return formatAud(meal.estCostAud);
  }

  choiceLabel(choice: MealVote | null) {
    return choice ?? 'waiting';
  }

  private sync(list: ShoppingList, week: MealWeek) {
    this.mealsApi.considerMatches(list, week.weekId, week.meals).catch((e) => {
      if (this.told) return;
      this.told = true;
      this.ui.error('Could not add the ingredients', e);
    });
  }

  private dropOptimistic(meals: MealIdea[]) {
    const mine = this.myUid();
    this.optimistic.update((cur) => {
      let changed = false;
      const next = { ...cur };
      for (const meal of meals) {
        if (next[meal.id] && meal.votes[mine] === next[meal.id]) {
          delete next[meal.id];
          changed = true;
        }
      }
      return changed ? next : cur;
    });
  }

  /** Toast when a meal lands on the list, but not for ones that were already agreed when the screen opened. */
  private noteApplied(meals: MealIdea[]) {
    if (this.announced) {
      for (const meal of meals) {
        if (meal.appliedAt && !this.announcedIds.has(meal.id)) this.ui.toast(`${meal.title} is on the list`);
      }
    }
    this.announced = true;
    for (const meal of meals) if (meal.appliedAt) this.announcedIds.add(meal.id);
  }
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
