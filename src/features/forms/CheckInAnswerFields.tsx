import { FormQuestion } from '../../services/formsService';

export type AnswerValues = Record<string, string | number | null>;

/**
 * Campos de un check-in (escala 0-10, número y texto libre).
 * Compartido por el formulario del atleta y el editor del coach para que
 * ambos rellenen exactamente lo mismo.
 */
export function CheckInAnswerFields({
    questions,
    values,
    onChange
}: {
    questions: FormQuestion[];
    values: AnswerValues;
    onChange: (id: string, value: string | number | null) => void;
}) {
    return (
        <>
            {questions.map(q => (
                <div key={q.id}>
                    <label className={`block text-sm font-bold text-white ${q.help ? 'mb-1' : 'mb-3'}`}>{q.label}</label>
                    {q.help && <p className="mb-3 text-xs text-gray-500">{q.help}</p>}

                    {q.qtype === 'scale' && (
                        <>
                            <div className="grid grid-cols-11 gap-1">
                                {Array.from({ length: 11 }, (_, i) => (
                                    <button
                                        key={i}
                                        type="button"
                                        onClick={() => onChange(q.id, values[q.id] === i ? null : i)}
                                        className={`aspect-square rounded-lg text-xs font-black transition-all ${
 values[q.id] === i
 ? 'bg-anvil-red text-white scale-110 shadow-lg shadow-anvil-red/30'
 : 'bg-white/5 text-gray-500 hover:bg-white/10 hover:text-white'
 }`}
                                    >
                                        {i}
                                    </button>
                                ))}
                            </div>
                            {(q.scale?.minLabel || q.scale?.maxLabel) && (
                                <div className="mt-1.5 flex justify-between text-[10px] text-gray-600">
                                    <span>{q.scale?.minLabel}</span>
                                    <span>{q.scale?.maxLabel}</span>
                                </div>
                            )}
                        </>
                    )}

                    {q.qtype === 'number' && (
                        <input
                            type="number"
                            inputMode="numeric"
                            value={values[q.id] ?? ''}
                            onChange={(e) => onChange(q.id, e.target.value === '' ? null : Number(e.target.value))}
                            placeholder="0"
                            className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl py-3 px-4 text-white text-base focus:border-anvil-red/50 transition-colors"
                        />
                    )}

                    {q.qtype === 'text' && (
                        <textarea
                            value={(values[q.id] as string) ?? ''}
                            onChange={(e) => onChange(q.id, e.target.value)}
                            rows={3}
                            maxLength={1000}
                            placeholder="Escribe aquí..."
                            className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl py-3 px-4 text-white text-base focus:border-anvil-red/50 transition-colors resize-none"
                        />
                    )}
                </div>
            ))}
        </>
    );
}
