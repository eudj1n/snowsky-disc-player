// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PairingForm from '../../../src/components/connection/PairingForm.vue'
import { chooseLocale } from '../../../src/i18n'

describe('PairingForm', () => {
  it('validates the token shape before emitting it', async () => {
    chooseLocale('en')
    const wrapper = mount(PairingForm, { props: { stored: false } })
    await wrapper.get('input').setValue('too-short')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('save')).toBeUndefined()
    expect(wrapper.text()).toContain('32 to 64')
    await wrapper.get('input').setValue(`  ${'k'.repeat(43)}  `)
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('save')).toEqual([['k'.repeat(43)]])
  })

  it('accepts the serial number only when the card enables SN pairing', async () => {
    chooseLocale('en')
    const plain = mount(PairingForm, { props: { stored: false } })
    await plain.get('input').setValue('0000 0000 0000 00')
    await plain.get('form').trigger('submit')
    expect(plain.emitted('save')).toBeUndefined()
    const serial = mount(PairingForm, { props: { stored: false, serial: true } })
    expect(serial.text()).toContain('Serial number or token')
    await serial.get('input').setValue('12')
    await serial.get('form').trigger('submit')
    expect(serial.text()).toContain('letters and digits')
    await serial.get('input').setValue(' 0000 0000 0000 00 ')
    await serial.get('form').trigger('submit')
    expect(serial.emitted('save')).toEqual([['00000000000000']])
  })

  it('offers to forget a stored token', async () => {
    const wrapper = mount(PairingForm, { props: { stored: true } })
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('forget')).toHaveLength(1)
  })
})
