<script setup lang="ts">
/**
 * Reference Home hero: dark green panel, headline, featured album line and a
 * "Play album" pill. Colors are fixed in both themes. Without observed cover
 * art the right side stays the base color under the gradient.
 */
import UiIcon from '../../ui/UiIcon.vue'

defineProps<{
  label: string
  eyebrow: string
  titleLines: [string, string]
  lines: [string, string]
  action: string
  actionDisabled: boolean
  actionTitle?: string
  /** The featured line is still loading: keep its space as a skeleton. */
  loading?: boolean
}>()
const emit = defineEmits<{ play: [] }>()
</script>

<template>
  <section
    :aria-label="label"
    class="relative isolate flex min-h-280 items-center overflow-hidden rounded-15 bg-[#252e2b] text-white after:absolute after:inset-0 after:z-[-1] after:bg-[linear-gradient(90deg,#202b27_0%,#263129_37%,transparent_70%)] wide:min-h-340 compact:min-h-260 phone:min-h-273 phone:rounded-12 phone:after:bg-[linear-gradient(90deg,#202b27ee,#263129b0_50%,transparent)]"
  >
    <div
      class="max-w-[61%] px-36 py-30 wide:pl-44 compact:p-28 rail:max-w-[75%] phone:max-w-[87%] phone:px-23 phone:py-26"
    >
      <span class="text-8 font-[650] tracking-[2.2px] text-[#bdc7b3] uppercase phone:text-7 phone:tracking-[1.5px]">{{
        eyebrow
      }}</span>
      <h2
        class="mt-19 mb-16 text-43 leading-[1.07] font-[550] tracking-[-1.7px] wide:text-55 compact:text-36 phone:text-35 [:lang(en)_&]:text-39 [:lang(en)_&]:phone:text-32"
      >
        {{ titleLines[0] }}<br />{{ titleLines[1] }}
      </h2>
      <p class="mt-0 mb-22 text-11 leading-[1.8] text-[#c1c7be] wide:text-13 phone:max-w-235 phone:text-10">
        <span v-if="loading" aria-hidden="true" class="flex h-[1lh] items-center"
          ><span class="block h-[0.8em] w-[70%] animate-pulse rounded-4 bg-white/15 motion-reduce:animate-none"
        /></span>
        <template v-else>{{ lines[0] }}<br /></template>{{ lines[1] }}
      </p>
      <button
        type="button"
        :disabled="actionDisabled"
        :title="actionTitle"
        class="inline-flex items-center justify-center gap-9 rounded-24 bg-[#f5f3e8] px-22 py-12 text-11 font-semibold text-[#30362a] shadow-[0_2px_10px_#0001] hover:enabled:-translate-y-1 hover:enabled:brightness-[1.04] phone:px-18 phone:py-11 phone:text-10"
        @click="emit('play')"
      >
        <UiIcon name="play" class="size-15" />{{ action }}
      </button>
    </div>
    <span
      class="absolute right-25 bottom-25 text-8 tracking-[1.7px] text-[#f9efe3c4] [writing-mode:vertical-rl] phone:right-16 phone:text-7"
      >MADE FOR LISTENING</span
    >
  </section>
</template>
