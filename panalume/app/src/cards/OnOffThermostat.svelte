<script module>
  export const meta = {
    type: 'thermostat-onoff', name: 'Thermostat (on/off by setpoint)', icon: 'mdi:radiator', category: 'Controls',
    size: { w: 300, h: 150 }, tap: 'none', hold: 'more-info',
    defaults: { entity: '', off_temp: 10, on_temp: 20, language: 'en' },
    fields: [
      { key: 'entity', label: 'Climate', type: 'entity', domain: 'climate' },
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'icon', label: 'Icon (blank = radiator / thermometer)', type: 'icon' },
      { key: 'on_entity', label: 'On/off sensor (optional, e.g. a binary_sensor)', type: 'entity' },
      { key: 'off_temp', label: 'Off = setpoint at or below (°C, blank = no on/off button)', type: 'number' },
      { key: 'on_temp', label: 'On = setpoint (°C)', type: 'number' },
      { key: 'step', label: 'Step (blank = from the thermostat)', type: 'number' },
      { key: 'language', label: 'Language', type: 'select', options: [{ value: 'en', label: 'English' }, { value: 'nl', label: 'Nederlands' }] },
    ],
  };
</script>

<script>
  // Thermostat for heating that switches off through its setpoint, not its
  // mode (e.g. Tydom via tydom2mqtt, whose HA mode is always "off"): off is a
  // setpoint at or below off_temp, the power button sends off_temp or on_temp.
  // −/+ changes are sent after a second and shown until the unit confirms them.
  import Icon from '../components/Icon.svelte';
  import { t, ent } from '../lib/tpl.js';
  import { formatNumber } from '../lib/entity.js';
  import { callService } from '../lib/ha.svelte.js';
  import { app } from '../lib/config.svelte.js';
  let { props, w = 300, h = 150 } = $props();

  const TXT = {
    en: { heating: 'Heating', idle: 'At temperature', off: 'Off', missing: 'Not found', power: 'On / off', down: 'Lower', up: 'Higher' },
    nl: { heating: 'Verwarmt', idle: 'Op temperatuur', off: 'Uit', missing: 'Niet gevonden', power: 'Aan / uit', down: 'Lager', up: 'Hoger' },
  };
  const L = $derived(TXT[props.language] || TXT.en);
  const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));

  const e = $derived(ent(props.entity));
  const a = $derived(e?.attributes || {});
  const offTemp = $derived(num(props.off_temp));
  const onTemp = $derived(num(props.on_temp) ?? 20);
  const step = $derived(num(props.step) ?? a.target_temp_step ?? 0.5);
  const unavailable = $derived(!e || e.state === 'unavailable');

  let pending = $state(null), sent = $state(null);
  let timer, resetTimer;
  // The new setpoint stays on screen until the thermostat reports it.
  $effect(() => {
    if (sent != null && a.temperature === sent) { pending = sent = null; clearTimeout(resetTimer); }
  });

  const isOffTemp = (v) => offTemp != null && v != null && v <= offTemp;
  const onState = $derived(ent(props.on_entity)?.state);
  const off = $derived(pending != null ? isOffTemp(pending)
    : onState === 'off' || isOffTemp(a.temperature) || (onState !== 'on' && a.temperature == null));
  const heating = $derived(a.hvac_action === 'heating' && !off);
  const status = $derived(!e ? L.missing : off ? L.off : a.hvac_action === 'heating' ? L.heating : a.hvac_action === 'idle' ? L.idle : '');
  const target = $derived(off ? null : pending ?? a.temperature);
  const decimals = $derived(Number.isInteger(a.target_temp_step ?? 0.5) ? 0 : 1);
  const C = $derived(heating ? '#ff8a4c' : off ? '#8a94a8' : '#7aa2ff');

  function send() {
    timer = undefined;
    if (pending == null || !e) return;
    callService('climate', 'set_temperature', { temperature: pending }, { entity_id: e.entity_id });
    sent = pending;
    // No confirmation within 15 s: show the real value again.
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => (pending = sent = null), 15000);
  }
  function power() {
    pending = off ? onTemp : offTemp;
    clearTimeout(timer);
    send();
  }
  function stepBy(dir) {
    // A room that's off starts from the measured temperature.
    const start = pending ?? (off ? null : a.temperature) ?? a.current_temperature;
    if (start == null) return;
    pending = Math.min(a.max_temp ?? 35, Math.max(a.min_temp ?? 7, Math.round((start + dir * step) / step) * step));
    clearTimeout(timer);
    timer = setTimeout(send, 1000);
  }
  // Leaving the page: still send a change that's waiting.
  $effect(() => () => { if (timer) { clearTimeout(timer); send(); } clearTimeout(resetTimer); });

  const narrow = $derived(w < 280);
</script>

<div class="th" class:narrow style="--c:{C}">
  <button class="head" onclick={() => e && (app.popup = { entity: e.entity_id })}>
    <span class="ic"><Icon icon={props.icon || (heating ? 'mdi:radiator' : 'mdi:thermometer')} size="1.2em" /></span>
    <span class="txt"><b>{t(props.name) || a.friendly_name || props.entity}</b><small>{status}</small></span>
  </button>
  <div class="bottom">
    <div class="cur">{a.current_temperature != null ? formatNumber(a.current_temperature, 1) : '—'}<small>{a.current_temperature != null ? '°C' : ''}</small></div>
    <div class="ctl">
      {#if offTemp != null}
        <button class="rb power" class:on={!off} title={L.power} disabled={unavailable} onclick={power}><Icon icon="mdi:power" size="1.2em" /></button>
      {/if}
      <button class="rb" title={L.down} disabled={unavailable} onclick={() => stepBy(-1)}><Icon icon="mdi:minus" size="1.2em" /></button>
      <span class="tgt" class:pending={pending != null} class:empty={target == null}>{target != null ? `${formatNumber(target, decimals)} °C` : L.off}</span>
      <button class="rb" title={L.up} disabled={unavailable} onclick={() => stepBy(1)}><Icon icon="mdi:plus" size="1.2em" /></button>
    </div>
  </div>
</div>

<style>
  .th { height: 100%; display: flex; flex-direction: column; justify-content: space-between; gap: 10px; }
  .head { all: unset; cursor: pointer; display: flex; align-items: center; gap: 10px; min-width: 0; }
  .ic { width: 2.2em; height: 2.2em; border-radius: 50%; display: grid; place-items: center; flex: none; background: color-mix(in srgb, var(--c) 22%, transparent); color: var(--c); transition: all .4s; }
  .txt { display: flex; flex-direction: column; min-width: 0; }
  .txt b { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .txt small { font-size: .78em; color: var(--muted); }
  .bottom { display: flex; align-items: flex-end; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
  .cur { font-size: 2em; font-weight: 600; line-height: 1; letter-spacing: -.02em; }
  .cur small { font-size: .45em; color: var(--muted); font-weight: 500; margin-left: 3px; }
  .ctl { display: flex; align-items: center; gap: 8px; }
  .narrow .ctl { width: 100%; justify-content: space-between; }
  .rb { width: 2.4em; height: 2.4em; flex: none; border-radius: 50%; border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.06); color: inherit; display: grid; place-items: center; cursor: pointer; transition: background .15s; }
  .rb:active { background: color-mix(in srgb, var(--c) 45%, transparent); }
  .rb:disabled { opacity: .4; cursor: default; }
  .power.on { background: #ff8a4c; border-color: #ff8a4c; color: #1c1c1f; }
  .tgt { min-width: 3.6em; text-align: center; font-size: 1.15em; font-weight: 600; white-space: nowrap; }
  .tgt.pending { color: #ffc861; }
  .tgt.empty { font-size: .85em; color: var(--muted); font-weight: 500; }
</style>
