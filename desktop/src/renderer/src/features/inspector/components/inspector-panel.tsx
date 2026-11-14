import { Film, Group, Image as ImageIcon, Music, Trash2, Type, Ungroup } from 'lucide-react'
import type { ReactNode } from 'react'
import { findMedia, useEditor, useVisibleSequence } from '@/features/editor/store/editor-store'
import { FRAME_RATES } from '@/features/project/components/new-project-dialog'
import { TRANSITIONS } from '@/features/project/mock/scenarios'
import * as ops from '@/features/timeline/model/operations'
import { formatShort, formatTimecode } from '@/features/timeline/model/time'
import { COLOR_TAGS, type Clip, type ClipTransform } from '@/features/timeline/model/types'
import { cx } from '@/shared/lib/seeded'
import { EFFECT_INFO, toggleEffect } from '../effects'

export const TAG_COLORS: Record<(typeof COLOR_TAGS)[number], string> = {
  red: '#ef5350',
  orange: '#f59e3b',
  yellow: '#facc15',
  green: '#4ade80',
  cyan: '#22d3ee',
  blue: '#60a5fa',
  violet: '#a78bfa',
  pink: '#f472b6'
}

const KIND_BADGE = {
  video: 'bg-clip-video/25 text-clip-video',
  image: 'bg-clip-image/25 text-clip-image',
  audio: 'bg-clip-audio/25 text-clip-audio',
  text: 'bg-clip-text/25 text-clip-text'
}

const TAG_NAMES: Record<(typeof COLOR_TAGS)[number], string> = {
  red: 'Rojo', orange: 'Naranja', yellow: 'Amarillo', green: 'Verde', cyan: 'Cian', blue: 'Azul', violet: 'Violeta', pink: 'Rosa'
}

/** Los deslizadores pintan en provisional y solo entran en el historial al soltar. */
function useLiveEdit(clipId: string) {
  const live = (patch: Partial<Clip>) => {
    const { sequence, setPreview } = useEditor.getState()
    setPreview(ops.updateClip(sequence, clipId, patch))
  }
  const done = () => {
    const { preview, commit } = useEditor.getState()
    if (preview) commit(preview)
  }
  return { live, done }
}

export function InspectorPanel() {
  const selection = useEditor((s) => s.selection)
  const seq = useVisibleSequence()
  const selected = seq.clips.filter((c) => selection.includes(c.id))

  return (
    <aside className="flex min-h-0 w-[300px] shrink-0 flex-col border-l border-line bg-panel">
      {selected.length === 0 && <SequenceSettings />}
      {selected.length === 1 && <ClipInspector clip={selected[0]} />}
      {selected.length > 1 && <MultiInspector clips={selected} />}
    </aside>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-line px-4 py-3">
      <h3 className="label mb-2.5">{title}</h3>
      <div className="space-y-2.5">{children}</div>
    </section>
  )
}

function Slider({ label, value, min, max, step = 1, unit = '', onLive, onDone }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onLive: (v: number) => void; onDone: () => void }) {
  return (
    <label className="grid grid-cols-[68px_minmax(0,1fr)_46px] items-center gap-2 text-2xs">
      <span className="text-muted">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onLive(Number(e.target.value))}
        onPointerUp={onDone}
        onKeyUp={onDone}
        className="w-full min-w-0 accent-[rgb(var(--c-accent))]"
      />
      <span className="whitespace-nowrap text-right font-mono">
        {Number.isInteger(value) ? value : value.toFixed(1)}
        {unit}
      </span>
    </label>
  )
}

function ClipInspector({ clip }: { clip: Clip }) {
  const media = useEditor((s) => findMedia(s.media, clip.mediaId))
  const seq = useVisibleSequence()
  const { setSpeed, updateClip, setTransition } = useEditor.getState()
  const { live, done } = useLiveEdit(clip.id)
  const kind = media?.kind ?? 'video'
  const visual = kind !== 'audio'
  const hasAudio = kind === 'video' || kind === 'audio'
  const transform = (patch: Partial<ClipTransform>) => live({ transform: { ...clip.transform, ...patch } })
  const canTransition = Boolean(ops.nextContiguous(seq, clip))
  const Icon = { video: Film, image: ImageIcon, audio: Music, text: Type }[kind]

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <span className={cx('flex h-8 w-8 items-center justify-center rounded-md', KIND_BADGE[kind])}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-medium">{kind === 'text' ? clip.text : media?.name}</p>
          <p className="text-2xs text-muted">{{ video: 'Vídeo', image: 'Imagen', audio: 'Audio', text: 'Texto' }[kind]}{media?.status === 'missing' && ' · desconectado'}</p>
        </div>
      </header>

      <Section title="Tiempo">
        <dl className="grid grid-cols-2 gap-2 text-2xs">
          <div>
            <dt className="text-muted">Inicio</dt>
            <dd className="font-mono">{formatTimecode(clip.start, seq.fps)}</dd>
          </div>
          <div>
            <dt className="text-muted">Duración</dt>
            <dd className="font-mono">{formatTimecode(ops.clipDuration(clip), seq.fps)}</dd>
          </div>
        </dl>
      </Section>

      {kind === 'text' && (
        <Section title="Texto">
          <textarea
            className="field h-20 resize-none py-1.5"
            value={clip.text ?? ''}
            onChange={(e) => live({ text: e.target.value })}
            onBlur={done}
            maxLength={200}
          />
          <div className="flex items-center gap-1.5">
            {['#ffffff', '#111111', '#f5a524', '#ef5350', '#60a5fa', '#4ade80'].map((c) => (
              <button
                key={c}
                onClick={() => updateClip(clip.id, { textColor: c })}
                className={cx('h-6 w-6 rounded-full border border-line', (clip.textColor ?? '#ffffff') === c && 'ring-2 ring-accent ring-offset-2 ring-offset-panel')}
                style={{ background: c }}
                aria-label={`Color ${c}`}
                title={c}
              />
            ))}
            <input
              type="color"
              aria-label="Otro color"
              value={clip.textColor ?? '#ffffff'}
              onChange={(e) => live({ textColor: e.target.value })}
              onBlur={done}
              className="ml-auto h-6 w-8 cursor-pointer rounded border border-line bg-transparent"
            />
          </div>
        </Section>
      )}

      {hasAudio && (
        <Section title="Velocidad">
          <div className="flex gap-1">
            {[0.5, 1, 1.5, 2, 4].map((v) => (
              <button
                key={v}
                onClick={() => setSpeed(clip.id, v)}
                className={cx('h-7 flex-1 rounded-md border text-2xs', clip.speed === v ? 'border-accent bg-accent/15 text-accent' : 'border-line hover:bg-raised')}
              >
                {v}×
              </button>
            ))}
          </div>
          <label className="flex items-center justify-between text-2xs">
            <span className="text-muted">Invertir reproducción</span>
            <input type="checkbox" checked={clip.reversed} onChange={(e) => updateClip(clip.id, { reversed: e.target.checked })} className="accent-[rgb(var(--c-accent))]" />
          </label>
          {clip.reversed && <p className="text-2xs text-muted">El visor prepara una copia temporal invertida. El original se conserva.</p>}
        </Section>
      )}

      {visual && (
        <Section title="Transformación">
          <Slider label="Opacidad" value={clip.transform.opacity} min={0} max={100} unit=" %" onLive={(v) => transform({ opacity: v })} onDone={done} />
          <Slider label="Escala" value={clip.transform.scale} min={10} max={300} unit=" %" onLive={(v) => transform({ scale: v })} onDone={done} />
          <Slider label="Posición X" value={clip.transform.x} min={-100} max={100} onLive={(v) => transform({ x: v })} onDone={done} />
          <Slider label="Posición Y" value={clip.transform.y} min={-100} max={100} onLive={(v) => transform({ y: v })} onDone={done} />
          <Slider label="Rotación" value={clip.transform.rotation} min={-180} max={180} unit="°" onLive={(v) => transform({ rotation: v })} onDone={done} />
        </Section>
      )}

      {visual && kind !== 'text' && (
        <Section title="Efectos">
          <div className="grid grid-cols-2 gap-1.5">
            {EFFECT_INFO.map((e) => {
              const on = clip.effects?.includes(e.id) ?? false
              return (
                <button
                  key={e.id}
                  aria-pressed={on}
                  onClick={() => updateClip(clip.id, { effects: toggleEffect(clip.effects, e.id) })}
                  className={cx('h-7 rounded-md border text-2xs', on ? 'border-accent bg-accent/15 text-accent' : 'border-line hover:bg-raised')}
                >
                  {e.label}
                </button>
              )
            })}
          </div>
        </Section>
      )}

      {hasAudio && (
        <Section title="Audio">
          <Slider label="Volumen" value={clip.volume} min={0} max={200} unit=" %" onLive={(v) => live({ volume: v })} onDone={done} />
          {clip.volume > 100 && <p className="text-2xs text-muted">La ganancia se aplica en visor y exportación. Un nivel alto puede saturar.</p>}
          <Slider label="Fundido entrada" value={(clip.fadeIn ?? 0) / 1_000_000} min={0} max={Math.min(5, ops.clipDuration(clip) / 2_000_000)} step={0.1} unit=" s" onLive={(v) => live({ fadeIn: Math.round(v * 1_000_000) })} onDone={done} />
          <Slider label="Fundido salida" value={(clip.fadeOut ?? 0) / 1_000_000} min={0} max={Math.min(5, ops.clipDuration(clip) / 2_000_000)} step={0.1} unit=" s" onLive={(v) => live({ fadeOut: Math.round(v * 1_000_000) })} onDone={done} />
        </Section>
      )}

      <Section title="Transición al siguiente clip">
        <select
          className="field"
          value={clip.transitionOut?.name ?? ''}
          onChange={(e) => setTransition(clip.id, e.target.value || null)}
          disabled={!canTransition && !clip.transitionOut}
        >
          <option value="">Sin transición</option>
          {TRANSITIONS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        {!canTransition && <p className="text-2xs text-muted">Necesita otro clip pegado justo detrás en la misma pista.</p>}
      </Section>

      <Section title="Etiqueta de color">
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => updateClip(clip.id, { colorTag: undefined })}
            className={cx('h-6 w-6 rounded-full border border-line text-[10px] text-muted', !clip.colorTag && 'ring-2 ring-ink')}
            aria-label="Sin etiqueta"
            title="Sin etiqueta"
          >
            ∅
          </button>
          {COLOR_TAGS.map((tag) => (
            <button
              key={tag}
              onClick={() => updateClip(clip.id, { colorTag: tag })}
              className={cx('h-6 w-6 rounded-full', clip.colorTag === tag && 'ring-2 ring-ink ring-offset-2 ring-offset-panel')}
              style={{ background: TAG_COLORS[tag] }}
              aria-label={TAG_NAMES[tag]}
              title={TAG_NAMES[tag]}
            />
          ))}
        </div>
      </Section>
    </div>
  )
}

function MultiInspector({ clips }: { clips: Clip[] }) {
  const { groupSelection, ungroupSelection, deleteSelection } = useEditor.getState()
  const grouped = clips.every((c) => c.groupId && c.groupId === clips[0].groupId)
  return (
    <div className="p-4">
      <p className="font-medium">{clips.length} clips seleccionados</p>
      <p className="mt-1 text-2xs text-muted">Suman {formatShort(clips.reduce((sum, c) => sum + ops.clipDuration(c), 0))} de material</p>
      <div className="mt-4 space-y-2">
        {grouped ? (
          <button className="btn-ghost w-full border border-line" onClick={ungroupSelection}>
            <Ungroup className="h-4 w-4" /> Desagrupar
          </button>
        ) : (
          <button className="btn-ghost w-full border border-line" onClick={groupSelection}>
            <Group className="h-4 w-4" /> Agrupar
          </button>
        )}
        <button className="btn-ghost w-full border border-line text-danger" onClick={() => deleteSelection(false)}>
          <Trash2 className="h-4 w-4" /> Borrar
        </button>
      </div>
    </div>
  )
}

function SequenceSettings() {
  const seq = useEditor((s) => s.sequence)
  const updateSequence = useEditor((s) => s.updateSequence)
  const rateIndex = FRAME_RATES.findIndex((r) => r.fps.num === seq.fps.num && r.fps.den === seq.fps.den)
  return (
    <div className="flex-1 overflow-y-auto">
      <header className="border-b border-line px-4 py-3">
        <p className="text-[13px] font-medium">{seq.name}</p>
        <p className="text-2xs text-muted">Nada seleccionado · ajustes de la secuencia</p>
      </header>
      <Section title="Formato">
        <label className="block space-y-1 text-2xs">
          <span className="text-muted">Resolución</span>
          <select
            className="field"
            value={`${seq.width}x${seq.height}`}
            onChange={(e) => {
              const [width, height] = e.target.value.split('x').map(Number)
              updateSequence({ width, height })
            }}
          >
            {['1920x1080', '3840x2160', '1280x720', '1080x1920', '1080x1080'].map((r) => (
              <option key={r} value={r}>
                {r.replace('x', ' × ')}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-2xs">
          <span className="text-muted">Fotogramas por segundo</span>
          <select className="field" value={rateIndex} onChange={(e) => updateSequence({ fps: FRAME_RATES[Number(e.target.value)].fps })}>
            {rateIndex === -1 && <option value={-1}>Personalizada</option>}
            {FRAME_RATES.map((r, i) => (
              <option key={r.label} value={i}>
                {r.label} fps
              </option>
            ))}
          </select>
        </label>
      </Section>
      <Section title="Resumen">
        <dl className="grid grid-cols-2 gap-2 text-2xs">
          <div>
            <dt className="text-muted">Duración</dt>
            <dd className="font-mono">{formatTimecode(ops.sequenceDuration(seq), seq.fps)}</dd>
          </div>
          <div>
            <dt className="text-muted">Clips</dt>
            <dd className="font-mono">{seq.clips.length}</dd>
          </div>
          <div>
            <dt className="text-muted">Pistas</dt>
            <dd className="font-mono">{seq.tracks.length}</dd>
          </div>
          <div>
            <dt className="text-muted">Audio</dt>
            <dd className="font-mono">{seq.sampleRate / 1000} kHz · {seq.channels === 2 ? 'estéreo' : 'mono'}</dd>
          </div>
        </dl>
      </Section>
    </div>
  )
}
