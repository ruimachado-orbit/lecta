import { GENERATION_TONES, GENERATION_VERBOSITIES } from '../../../../../packages/shared/src/constants'

export function TonePills({
  value, onChange, disabled,
}: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}): JSX.Element {
  return (
    <div>
      <label className="text-sm text-gray-300 block mb-1.5">Tone</label>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tone">
        {GENERATION_TONES.map((t) => {
          const active = value === t.id
          return (
            <button
              key={t.id}
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(t.id)}
              className={`px-2.5 py-1 text-[11px] rounded-full border transition-colors disabled:opacity-30 ${
                active
                  ? 'bg-white text-black border-white font-medium'
                  : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500 hover:text-gray-200'
              }`}
            >
              {t.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function VerbosityPills({
  value, onChange, disabled,
}: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}): JSX.Element {
  return (
    <div>
      <label className="text-sm text-gray-300 block mb-1.5">Content density</label>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Content density">
        {GENERATION_VERBOSITIES.map((v) => {
          const active = value === v.id
          return (
            <button
              key={v.id}
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(v.id)}
              className={`px-2.5 py-1 text-[11px] rounded-full border transition-colors disabled:opacity-30 ${
                active
                  ? 'bg-white text-black border-white font-medium'
                  : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500 hover:text-gray-200'
              }`}
            >
              {v.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
