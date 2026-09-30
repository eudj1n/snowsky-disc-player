import { createApp } from 'vue'
import App from './App.vue'
import { followScriptLanguages } from './lib/scriptLanguages'
import { keepEarlyAddress, router } from './router'
import './styles/main.css'

keepEarlyAddress()
createApp(App).use(router).mount('#app')
// Japanese and Korean names get their language, dialogs included (docs/typography.md).
followScriptLanguages(document.body)
