// 개발용: API 서버(3001)와 Vite(5173)를 함께 실행
import { spawn } from 'node:child_process'

const procs = [
  // Vite 프록시가 3001을 바라보므로, 바깥에서 PORT가 주어져도(미리보기 도구 등) API 서버는 3001에 띄운다
  spawn(process.execPath, ['--watch', 'server/index.ts'], { stdio: 'inherit', env: { ...process.env, PORT: '3001' } }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', ...process.argv.slice(2)], { stdio: 'inherit' }),
]
const stop = () => {
  for (const p of procs) p.kill()
  process.exit()
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
for (const p of procs) p.on('exit', (code) => code && stop())
