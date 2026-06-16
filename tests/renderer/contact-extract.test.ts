import { describe, it, expect } from 'vitest'
import { extractContact } from '../../src/renderer/contact-extract'

describe('extractContact', () => {
  it('parses the 3-line sample (name / phone / address with bracket noise)', () => {
    const r = extractContact('程玲[2817]\n19592642954\n江苏省苏州市虎丘区 龙湖时代100 8栋2207[2817]')
    expect(r.name).toBe('程玲')
    expect(r.phone).toBe('19592642954')
    expect(r.extension).toBe('2817')
    expect(r.province).toBe('江苏省')
    expect(r.city).toBe('苏州市')
    expect(r.district).toBe('虎丘区')
    expect(r.addressDetail).toBe('龙湖时代100 8栋2207')
    expect(r.provinceCode).toBe('32')
    expect(r.cityCode).toBe('3205')
    expect(r.districtCode).toBe('320505')
  })

  it('extracts extension from a virtual number (转 and , separators)', () => {
    expect(extractContact('张三 17012345678转5678').extension).toBe('5678')
    expect(extractContact('张三 17012345678,5678').extension).toBe('5678')
    expect(extractContact('张三 17012345678').extension).toBe('')
  })

  it('parses a single-line flow format (name before province)', () => {
    const r = extractContact('张三 13800138000 江苏省苏州市虎丘区 龙湖时代100')
    expect(r.name).toBe('张三')
    expect(r.phone).toBe('13800138000')
    expect(r.province).toBe('江苏省')
    expect(r.district).toBe('虎丘区')
    expect(r.addressDetail).toBe('龙湖时代100')
  })

  it('parses a labeled format and a municipality (直辖市)', () => {
    const r = extractContact('收货人:李四\n联系电话:13800138000\n收货地址:北京市朝阳区某某路9号')
    expect(r.name).toBe('李四')
    expect(r.phone).toBe('13800138000')
    expect(r.province).toBe('北京市')
    expect(r.city).toBe('市辖区')
    expect(r.district).toBe('朝阳区')
    expect(r.addressDetail).toBe('某某路9号')
  })

  it('returns empty fields for blank / unrecognizable input', () => {
    expect(extractContact('')).toEqual({
      name: '', phone: '', extension: '', provinceCode: '', province: '',
      cityCode: '', city: '', districtCode: '', district: '', addressDetail: ''
    })
    const r = extractContact('随便一段没有手机也没有地址的文字')
    expect(r.phone).toBe('')
    expect(r.province).toBe('')
  })

  it('does not treat a hyphenated building number as an extension', () => {
    const r = extractContact('王五\n13800138000-1栋303室\n广东省广州市天河区珠江新城')
    expect(r.phone).toBe('13800138000')
    expect(r.extension).toBe('')
    expect(r.province).toBe('广东省')
    expect(r.city).toBe('广州市')
    expect(r.district).toBe('天河区')
  })

  it('does not pull a phone out of a longer digit run', () => {
    expect(extractContact('213800138000').phone).toBe('')
  })

  it('does not extract a phone from a long glued digit run', () => {
    expect(extractContact('13800138000123').phone).toBe('')
  })

  it('captures a bracketed code as the extension (PDD virtual number)', () => {
    const r = extractContact('大潘[0106]\n17821552870\n山东省青岛市城阳区 高新区世茂璀璨珑园48号楼1单元1901[0106]')
    expect(r.name).toBe('大潘')
    expect(r.phone).toBe('17821552870')
    expect(r.extension).toBe('0106')
    expect(r.province).toBe('山东省')
    expect(r.city).toBe('青岛市')
    expect(r.district).toBe('城阳区')
    expect(r.addressDetail).toBe('高新区世茂璀璨珑园48号楼1单元1901')
  })

  it('inline extension takes priority over bracketed code', () => {
    expect(extractContact('张三[0106] 17012345678转5678').extension).toBe('5678')
  })

  it('does not false-match the single-char 县 proxy as a city (Chongqing county)', () => {
    const r = extractContact('重庆市城口县新城街道1号')
    expect(r.province).toBe('重庆市')
    expect(r.city).toBe('')
    expect(r.district).toBe('')
    expect(r.addressDetail).toContain('城口县')
  })
})
