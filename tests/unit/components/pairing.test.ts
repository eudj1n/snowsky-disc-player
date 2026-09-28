// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PairingForm from '../../../src/components/connection/PairingForm.vue'
import { chooseLocale } from '../../../src/i18n'

describe('PairingForm', () => {
  it('asks for the serial number and checks its shape before emitting it', async () => {
    chooseLocale('en')
    const wrapper = mount(PairingForm, { props: { stored: false } })
    expect(wrapper.text()).toContain('Serial number')
    expect(wrapper.text()).toContain('SN under About device')
    await wrapper.get('input').setValue('12')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('save')).toBeUndefined()
    expect(wrapper.text()).toContain('6 to 32 letters and digits')
    // A card token of an earlier image is not a serial number.
    await wrapper.get('input').setValue('k'.repeat(43))
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('save')).toBeUndefined()
    await wrapper.get('input').setValue(' 0000 0000 0000 00 ')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('save')).toEqual([['00000000000000']])
  })

  it('offers to forget a stored serial number', async () => {
    const wrapper = mount(PairingForm, { props: { stored: true } })
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('forget')).toHaveLength(1)
  })
})
