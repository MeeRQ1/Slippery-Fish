/**
 * Settings — hanging sign. Audio, controls, accessibility, graphics, save &
 * account (honest local-guest status, export/import/reset of the LOCAL save)
 * and the entry to Privacy & Legal. Every change applies immediately.
 */
import { MUSIC } from '../../config/audio';
import { CONTENT_VERSION, GENERATOR_VERSION, SAVE_VERSION, APP_VERSION } from '../../config/versions';
import type { Settings } from '../../save/settings';
import { iceButton, woodButton } from '../components/buttons';
import { confirmDialog, segmented, slider, toggle } from '../components/controls';
import { h } from '../dom';
import { SignScreen } from '../screen';

export class SettingsSign extends SignScreen {
  readonly id = 'settings';
  readonly title = 'SETTINGS';
  protected override boardClass = 'wide';

  protected buildContent(c: HTMLElement): void {
    this.render(c);
  }

  private set(patch: Partial<Settings>): void {
    this.app.settings.update(patch);
  }

  private render(c: HTMLElement): void {
    const s = this.app.settings.get();
    const musicMissing = Object.values(MUSIC).every((m) => m === null);
    const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
    const storage = this.app.save.storageKind;
    const storageText = storage === 'indexeddb' ? 'Saved in this browser (IndexedDB).' : storage === 'localstorage' ? 'Saved in this browser (localStorage fallback).' : 'Your browser is blocking storage — progress will be LOST when this tab closes. Use Export Save to keep it.';
    const auth = this.app.auth.state();
    const cloud = this.app.cloudSave.state();
    const signIn = this.app.auth.canSignIn();
    const pct = (v: number) => `${Math.round(v * 100)}%`;

    c.replaceChildren(
      h('div', { class: 'settings-grid' },
        this.group('AUDIO',
          slider('Master volume', s.masterVolume, { min: 0, max: 1, step: 0.05, onInput: (v) => this.set({ masterVolume: v }) }),
          slider('Music', s.musicVolume, { min: 0, max: 1, step: 0.05, onInput: (v) => this.set({ musicVolume: v }) }),
          slider('Sound effects', s.sfxVolume, { min: 0, max: 1, step: 0.05, onInput: (v) => this.set({ sfxVolume: v }), onCommit: () => this.app.audio.play('fishBounce') }),
          toggle('Music on', s.musicOn, (v) => this.set({ musicOn: v }), musicMissing ? { note: 'No music tracks are bundled yet — this applies once they are added.' } : {}),
          toggle('Button sounds', s.buttonSounds, (v) => this.set({ buttonSounds: v })),
        ),
        this.group('CONTROLS',
          h('div', { class: 'keys-ref' },
            this.key(['W', 'A', 'S', 'D'], 'Waddle (arrow keys work too)'),
            this.key(['Left Shift'], 'Hold to sprint (uses stamina)'),
            this.key(['Esc', 'P'], 'Pause'),
          ),
          segmented('Touch controls', s.touchControls, [{ value: 'auto', label: 'Auto' }, { value: 'on', label: 'On' }, { value: 'off', label: 'Off' }], (v) => this.set({ touchControls: v })),
          toggle('Joystick on the right', s.swapTouchSides, (v) => this.set({ swapTouchSides: v }), { note: 'Puts the sprint button on the left.' }),
          toggle('Vibration', s.haptics && canVibrate, (v) => this.set({ haptics: v }), canVibrate ? {} : { disabled: true, disabledReason: 'This browser or device doesn’t support vibration.', note: 'Not supported on this device.' }),
        ),
        this.group('ACCESSIBILITY',
          toggle('Reduced motion', s.reducedMotion, (v) => this.set({ reducedMotion: v }), { note: 'Calmer menus, no screen shake.' }),
          slider('Screen shake', s.screenShake, { min: 0, max: 1, step: 0.05, onInput: (v) => this.set({ screenShake: v }) }),
          slider('Danger warning strength', s.warningIntensity, { min: 0.25, max: 1.5, step: 0.05, format: pct, onInput: (v) => this.set({ warningIntensity: v }) }),
          slider('Interface size', s.uiScale, { min: 0.85, max: 1.3, step: 0.05, format: pct, onInput: () => undefined, onCommit: (v) => this.set({ uiScale: v }) }),
        ),
        this.group('GRAPHICS',
          segmented('Quality', s.quality, [{ value: 'auto', label: 'Auto' }, { value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' }], (v) => this.set({ quality: v })),
          toggle('Show FPS', s.showFps, (v) => this.set({ showFps: v })),
          this.app.settings.persistent ? null : h('p', { class: 'warn-note', text: 'Your browser is blocking storage, so settings last only for this session.' }),
        ),
        this.group('SAVE & ACCOUNT',
          h('div', { class: 'acct-status' },
            h('span', { class: 'chip', text: auth.kind === 'guest' ? 'Guest (local)' : `Signed in · ${auth.displayName}` }),
            h('p', { class: 'small', text: auth.kind === 'guest' ? auth.reason : `Signed in with ${auth.provider}.` }),
            h('p', { class: `small ${storage === 'memory' ? 'warn-note' : 'muted'}`, text: storageText }),
            h('p', { class: 'small muted', text: cloud.available ? 'Cloud save is on.' : cloud.reason }),
          ),
          h('div', { class: 'btn-row' },
            woodButton('SIGN IN', { size: 'small', disabled: !signIn.available, disabledReason: signIn.reason, onActivate: () => void this.app.auth.signIn() }),
            woodButton('EXPORT SAVE', { size: 'small', sound: 'click', onActivate: () => this.exportSave() }),
            woodButton('IMPORT SAVE', { size: 'small', sound: 'click', onActivate: () => this.importSave() }),
          ),
          h('div', { class: 'btn-row' },
            woodButton('ERASE THIS DEVICE’S SAVE', { size: 'small', variant: 'red', sound: 'denied', onActivate: () => void this.resetSave() }),
          ),
        ),
        this.group('PRIVACY & LEGAL',
          h('p', { class: 'small', text: 'Privacy Policy, Terms of Use, privacy choices, data deletion, support and third-party notices.' }),
          woodButton('PRIVACY & LEGAL', { size: 'small', sound: 'click', onActivate: () => void this.router.go('legal', { from: 'settings' }) }),
        ),
        this.group('ABOUT',
          h('p', { class: 'small muted', text: `Slippery Fish ${APP_VERSION} · content v${CONTENT_VERSION} · generator v${GENERATOR_VERSION} · save v${SAVE_VERSION}` }),
          h('p', { class: 'small muted', text: `Built ${typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__.slice(0, 10) : 'locally'}` }),
          iceButton('RESET SETTINGS TO DEFAULT', { class: 'small', sound: 'clickSoft', onActivate: () => { this.app.settings.reset(); this.render(c); this.router.toast('Settings reset.'); } }),
        ),
      ),
    );
  }

  private group(title: string, ...children: Array<Node | null>): HTMLElement {
    return h('section', { class: 'settings-group' }, h('h3', { text: title }), ...children);
  }

  private key(keys: string[], what: string): HTMLElement {
    return h('div', { class: 'key-row' }, h('span', { class: 'key-caps' }, ...keys.map((k) => h('kbd', { text: k }))), h('span', { class: 'small', text: what }));
  }

  private exportSave(): void {
    const json = this.app.save.exportJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { attrs: { href: url, download: `slippery-fish-save-${new Date().toISOString().slice(0, 10)}.json` } });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    this.router.toast('Save exported. Keep the file somewhere safe!');
  }

  private importSave(): void {
    const input = h('input', { attrs: { type: 'file', accept: 'application/json,.json' }, style: { display: 'none' } });
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      if (file.size > 2_000_000) { this.router.toast('That file is too big to be a Slippery Fish save.'); return; }
      void file.text().then(async (text) => {
        const ok = await confirmDialog({ title: 'IMPORT SAVE?', body: 'This replaces the progress on this device with the progress in the file. Your current save is kept as a backup copy.', confirmLabel: 'IMPORT' });
        if (!ok) return;
        try {
          await this.app.save.importJson(text);
          this.app.quests.refresh();
          this.router.toast('Save imported!');
        } catch (err) {
          this.router.toast(err instanceof Error ? err.message : 'Import failed.');
        }
      });
    });
    document.body.append(input);
    input.click();
  }

  private async resetSave(): Promise<void> {
    const ok = await confirmDialog({
      title: 'ERASE LOCAL SAVE?',
      body: h('div', {},
        h('p', { text: 'This permanently erases ALL progress stored in this browser: levels, stars, best times, currencies, Hoods, Waddles, quests and stats.' }),
        h('p', { class: 'small muted', text: 'This version has no online accounts, so nothing is stored on a server — this is the only copy unless you exported it.' })),
      confirmLabel: 'ERASE', danger: true, requireText: 'ERASE',
    });
    if (!ok) return;
    await this.app.save.resetLocal();
    this.app.quests.refresh();
    this.router.toast('Local save erased. Fresh ice!');
  }
}
