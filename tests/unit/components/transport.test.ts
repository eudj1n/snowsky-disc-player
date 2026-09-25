// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TransportControls from '../../../src/components/playback/TransportControls.vue'
import { chooseLocale } from '../../../src/i18n'

describe('TransportControls', () => {
  it('emits transport intents in order and labels every button', async () => {
    chooseLocale('en')
    const wrapper = mount(TransportControls, { props: { state: 'paused', disabled: false } })
    const buttons = wrapper.findAll('button')
    expect(buttons.map((button) => button.attributes('aria-label'))).toEqual(['Previous', 'Play or pause', 'Next'])
    for (const button of buttons) await button.trigger('click')
    expect(wrapper.emitted('transport')).toEqual([['previous'], ['toggle'], ['next']])
  })

  it('shows pause while playing and play otherwise', () => {
    const playing = mount(TransportControls, { props: { state: 'playing', disabled: false } })
    const unknown = mount(TransportControls, { props: { state: 'unknown', disabled: false } })
    expect(playing.get('[data-testid=toggle] path').attributes('d')).not.toBe(
      unknown.get('[data-testid=toggle] path').attributes('d'),
    )
  })

  it('emits nothing while disabled', async () => {
    const wrapper = mount(TransportControls, { props: { state: 'paused', disabled: true } })
    for (const button of wrapper.findAll('button')) {
      expect(button.attributes('disabled')).toBeDefined()
      await button.trigger('click')
    }
    expect(wrapper.emitted('transport')).toBeUndefined()
  })
})
