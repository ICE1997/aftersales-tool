import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { RegionCascader, EMPTY_REGION, type RegionValue } from '../../src/renderer/components/RegionCascader'

function Harness({ onChange }: { onChange: (v: RegionValue) => void }) {
  const [v, setV] = useState<RegionValue>(EMPTY_REGION)
  return <RegionCascader value={v} onChange={(nv) => { setV(nv); onChange(nv) }} />
}

describe('RegionCascader', () => {
  it('selecting a province enables the city list and reports the province name', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const cityBefore = screen.getAllByRole('combobox')[1] as HTMLSelectElement
    expect(cityBefore.disabled).toBe(true)

    const prov = screen.getAllByRole('combobox')[0]
    // Pick the first real province option from the dataset (not the '' placeholder).
    const firstProvinceCode = (Array.from((prov as HTMLSelectElement).options).find((o) => o.value !== '')!).value
    fireEvent.change(prov, { target: { value: firstProvinceCode } })

    expect(onChange).toHaveBeenCalled()
    const last = onChange.mock.calls.at(-1)![0] as RegionValue
    expect(last.provinceCode).toBe(firstProvinceCode)
    expect(last.province.length).toBeGreaterThan(0)

    const cityAfter = screen.getAllByRole('combobox')[1] as HTMLSelectElement
    expect(cityAfter.disabled).toBe(false)
  })
})
