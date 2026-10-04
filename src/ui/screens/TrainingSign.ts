/**
 * Training Rink — the optional in-depth tutorial. Lessons can be played in
 * any order, replayed any time and skipped entirely; nothing here blocks the
 * rest of the game. Each card shows the demonstration line, the controls and
 * the hands-on objective.
 */
import { TRAINING_LESSONS, type TrainingLesson } from '../../levels/training';
import { trainingDriver } from '../../progression/drivers';
import { woodButton } from '../components/buttons';
import { clear, h } from '../dom';
import { SignScreen } from '../screen';

export class TrainingSign extends SignScreen {
  readonly id = 'training';
  readonly title = 'TRAINING RINK';
  protected override boardClass = 'wide';
  private list!: HTMLElement;

  protected buildContent(c: HTMLElement): void {
    this.list = h('div', { class: 'training-list' });
    const done = this.app.save.data.tutorial.lessonsDone.length;
    c.append(
      h('p', { class: 'small muted', text: `Optional, replayable and skippable: short hands-on lessons on real ice. ${done ? `${done} of ${TRAINING_LESSONS.length} done.` : 'Start anywhere — or skip it and play.'}` }),
      this.list,
    );
    this.render();
  }

  private render(): void {
    const done = new Set(this.app.save.data.tutorial.lessonsDone);
    clear(this.list);
    TRAINING_LESSONS.forEach((l, i) => {
      const isDone = done.has(l.id);
      const card = h('div', { class: `training-card ${isDone ? 'done' : ''}` },
        h('div', { class: 'tc-step', text: isDone ? '✓' : String(i + 1) }),
        h('div', { class: 'tc-body' },
          h('b', { text: l.title }),
          h('p', { text: l.demo }),
          l.controls ? h('p', { class: 'small muted', text: `Controls: ${l.controls}` }) : null,
          h('p', { class: 'small tc-goal', text: `Goal: ${l.objective}` }),
        ),
        this.action(l),
      );
      this.list.append(card);
    });
  }

  private action(l: TrainingLesson): HTMLElement {
    if (l.level) return woodButton('PLAY', { variant: 'green', size: 'small', sound: 'click', onActivate: () => void this.router.go('play', { driver: trainingDriver(this.app.driverServices, l) }) });
    const b = woodButton(l.link!.label, { size: 'small', sound: 'click', onActivate: () => {
      this.app.save.mutate((s) => { if (!s.tutorial.lessonsDone.includes(l.id)) s.tutorial.lessonsDone.push(l.id); });
      void this.router.go(l.link!.screen);
    } });
    return b;
  }
}
