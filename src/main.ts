import { createApp } from 'vue'
import App from './App.vue'
import { keepEarlyAddress, router } from './router'
import './styles/main.css'

keepEarlyAddress()
createApp(App).use(router).mount('#app')
