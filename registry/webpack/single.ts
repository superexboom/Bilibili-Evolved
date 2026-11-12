import { buildByEntry } from './config'

/**
 * 非交互式构建单个功能, 用于本地构建与 CI.
 * 用法: BUILD_ENTRY=./registry/lib/components/style/home-redesign/fresh-plus/index.ts \
 *   pnpm webpack --config ./registry/webpack/single.ts --bail
 */
const entry = process.env.BUILD_ENTRY
if (!entry) {
  throw new Error('BUILD_ENTRY is required')
}
const type = entry.includes('/registry/lib/plugins/') ? 'plugin' : 'component'
export default [buildByEntry({ src: `./registry/lib/${type}s/`, type, entry })]
