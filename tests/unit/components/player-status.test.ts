// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PlayerStatus from '../../../src/components/player/PlayerStatus.vue'
import { chooseLocale } from '../../../src/i18n'

describe('PlayerStatus', () => {
  it('shows the state and, once connected, the identity', () => {
    chooseLocale('ru')
    const idle = mount(PlayerStatus, { props: { state: 'disconnected', identity: null } })
    expect(idle.get('[data-testid=connection-state]').text()).toBe('Не подключён')
    expect(idle.find('[data-testid=identity]').exists()).toBe(false)
    const connected = mount(PlayerStatus, {
      props: { state: 'connected', identity: { handshake: '0306', firmware: 257, compatible: true } },
    })
    expect(connected.get('[data-testid=identity]').text()).toBe('0306')
    expect(connected.get('[data-testid=firmware]').text()).toBe('257')
  })
})
