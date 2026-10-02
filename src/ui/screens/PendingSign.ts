import { SignScreen } from '../screen';
import { h } from '../dom';

/** Temporary sign used while a screen is being built (replaced screen by screen). */
export class PendingSign extends SignScreen {
  readonly id = 'pending';
  get title(): string { return String(this.params.which ?? '').toUpperCase(); }
  protected buildContent(c: HTMLElement): void {
    c.append(h('p', { text: 'This screen is being built.' }));
  }
}
