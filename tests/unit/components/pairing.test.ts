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

  it('offers to forget a stored token', async () => {
    const wrapper = mount(PairingForm, { props: { stored: true } })
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('forget')).toHaveLength(1)
  })
})
