/**
 * 从当前运行的宿主 inspect 结果生成本仓真实的 touchpoints.json + host-snapshot.json。
 * 用途：DSH 升级后跑 recheck 做触点复检。
 * 数据来源：cordis_inspect_query（本文件不联网、不读 DSH_HOME，只写仓库内 assets/）。
 */
import { writeFileSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SKILL_DIR = join(HERE, '..', 'skills', 'plugin-kit')
const OUT = join(SKILL_DIR, 'assets')

// 宿主版本号从 VERSION.json 读（reextract 每次重解都会把它更新成 asar 里的真实版本）。
// 不要在这里写死 '0.2.2-rc.x'——那正是本仓反复踩过的坑：把会变的东西当常量。
const HOST_VERSION = (() => {
  try {
    const v = JSON.parse(readFileSync(join(SKILL_DIR, 'host-skills', 'VERSION.json'), 'utf8'))
    return typeof v.dsh === 'string' && v.dsh.length > 0 ? v.dsh : 'unknown'
  } catch {
    return 'unknown'
  }
})()
if (HOST_VERSION === 'unknown') {
  console.error('FAIL  读不到 host-skills/VERSION.json 的 dsh 字段——快照会标成 unknown')
  process.exit(1)
}

// ---- 宿主快照：只记我们真正依赖的条目（在 rc.3 上用 inspect 实测后手填结构化）----
const snapshot = {
  _comment: '本仓依赖的宿主触点快照。由 scripts/gen-host-snapshot.mjs 从 cordis_inspect_query 的结果整理；升级后重跑它对比。',
  host: {
    version: HOST_VERSION,
    exportedAt: new Date().toISOString(),
    source: 'cordis_inspect_query（host Service.listService / Event.listEvents / Config.listConfigs）',
  },
  services: {
    skills: {
      description: 'Layered registry of skill providers（plugin-kit 的 Host 半用它注册 skill）',
      methods: {
        registerProvider: 'registerProvider(create: (control: SkillProviderControl) => SkillProvider): () => void',
        register: 'register(skill: SkillRegistration): () => void',
        list: 'async list(options: SkillViewOptions = {}): Promise<SkillSummary[]>',
        get: 'async get(name: string, options: SkillViewOptions = {}): Promise<SkillDefinition | undefined>',
        snapshot: 'async snapshot(options: SkillViewOptions = {}): Promise<SkillCatalogSnapshot>',
      },
      types: {
        SkillProvider: "export interface SkillProvider {\n    readonly name: string;\n    readonly list: (options: SkillLookupOptions) => Promise<readonly SkillCandidate[] | SkillProviderObservation>;\n    readonly get: (candidate: SkillCandidate, options: SkillLookupOptions) => Promise<SkillDefinition | undefined>;\n}",
        SkillResourceBase: "export type SkillResourceBase = {\n    readonly kind: 'directory';\n    readonly path: string;\n} | {\n    readonly kind: 'url';\n    readonly url: string;\n} | {\n    readonly kind: 'opaque';\n    readonly description: string;\n};",
        SkillDefinition: 'export interface SkillDefinition extends SkillSummary {\n    readonly content: string;\n    readonly metadata?: Readonly<Record<string, unknown>>;\n}',
      },
    },
    tools: {
      description: 'Concrete tool registry and scoped executor dispatcher.',
      methods: {
        register: 'register(definition: ToolDefinition, options: ToolRegistrationOptions = {}): () => void',
        restrict: 'restrict(filter: ToolRestriction): () => void',
        guard: 'guard(guard: ToolGuard): () => void',
        get: 'get(name: string, scope?: ScopeKey, toolSet?: ResolvedToolSet): ToolDefinition | undefined',
        definitions: 'definitions(scope?: ScopeKey, toolSet?: ResolvedToolSet): readonly ToolDefinition[]',
        schemas: 'schemas(scope?: ScopeKey, toolSet?: ResolvedToolSet): ToolSchema[]',
        execute: 'async execute(input: ToolBatchInput): Promise<ToolBatchResult>',
      },
    },
    agents: {
      description: 'Agent service (`ctx.agents`): tracks live agents.',
      methods: {
        list: 'list(): Agent[]',
        get: 'get(id: SessionId): Agent | undefined',
        register: "register(agent: Agent): ReturnType<Context['effect']>",
        announce: 'async announce(agent: Agent, source: SessionStartSource, signal?: AbortSignal): Promise<void>',
      },
    },
    webServer: {
      description: 'The browser HTTP carrier service.',
      methods: {
        register: 'register(route: WebRoute | WebResourceRoute): () => void',
        getOrigin: 'getOrigin(): string',
      },
    },
  },
  events: {
    'agent/created': {
      mode: 'serial',
      signature: "'agent/created'(this: Scoped<Agent>, payload: { agent: Agent; source: SessionStartSource; signal?: AbortSignal }): undefined | Promise<undefined>",
    },
    'agent/disposed': {
      mode: 'emit',
      signature: "'agent/disposed'(this: Scoped<Agent>, payload: { agent: Agent }): void",
    },
    'tools/change': {
      mode: 'emit',
      signature: "'tools/change'(this: Scoped<ToolsService>): void",
    },
  },
  configs: {
    _comment: '本插件不导出 Config；此处仅留空占位，保持结构与 sample 一致。',
  },
}

// ---- 触点清单：plugin-kit 自己 + 典型插件依赖的面 ----
const touchpoints = {
  _comment: '本仓的触点清单：plugin-kit 自身依赖的宿主面。升级后用 recheck.mjs --strict 复检。',
  host: HOST_VERSION,
  touchpoints: [
    {
      id: 'svc.skills.registerProvider',
      surface: 'service',
      ref: 'ctx.skills.registerProvider()',
      code: 'index.js:51',
      why: 'plugin-kit 的唯一宿主接缝：把 skills/ 注册进宿主 skill 目录',
      probe: {
        kind: 'service',
        service: 'skills',
        method: 'registerProvider',
        signatureIncludes: ['registerProvider', 'SkillProvider'],
      },
      status: 'verified',
      fallback: 'skill 不再出现在宿主 skill 目录，插件只剩日志',
    },
    {
      id: 'svc.skills.list',
      surface: 'service',
      ref: 'skills.list()',
      code: 'lib/skill-provider.js',
      why: '宿主用它汇总 provider 的候选；list 返回形状变化会影响索引',
      probe: {
        kind: 'service',
        service: 'skills',
        method: 'list',
        signatureIncludes: ['Promise<SkillSummary[]>'],
      },
      status: 'verified',
      fallback: 'skill 列表为空或字段缺失',
    },
    {
      id: 'type.SkillResourceBase',
      surface: 'type',
      ref: 'SkillResourceBase',
      code: 'lib/skill-provider.js',
      why: 'readSkill 必须报 resourceBase，否则模型不知道文件在哪（家族②）',
      probe: {
        kind: 'type',
        type: 'SkillResourceBase',
        via: { service: 'skills' },
        contains: ["kind: 'directory'", 'path: string'],
      },
      status: 'verified',
      fallback: '模型不知道 skill 文件在哪，读到的是空内容',
    },
    {
      id: 'svc.tools.register',
      surface: 'service',
      ref: 'ctx.tools.register()',
      code: '外部插件（dsh-tool-keeper）',
      why: '内置工具与 MCP 工具的共同注册入口——改写工具说明的唯一时机',
      probe: {
        kind: 'service',
        service: 'tools',
        method: 'register',
        signatureIncludes: ['ToolDefinition'],
      },
      status: 'verified',
      fallback: '无法在注册期改写工具定义',
    },
    {
      id: 'svc.tools.restrict',
      surface: 'service',
      ref: 'ctx.tools.restrict()',
      code: '外部插件（tool-mask / tool-keeper）',
      why: '把工具从模型可见工具表摘掉（省 token 的正解）',
      probe: {
        kind: 'service',
        service: 'tools',
        method: 'restrict',
        signatureIncludes: ['ToolRestriction'],
      },
      status: 'verified',
      fallback: '工具无法隐藏，只能靠 guard 拒绝调用（schema 仍占上下文）',
    },
    {
      id: 'svc.tools.guard',
      surface: 'service',
      ref: 'ctx.tools.guard()',
      code: '外部插件',
      why: '同步硬否决工具调用；deny 必须在同步阶段决定',
      probe: {
        kind: 'service',
        service: 'tools',
        method: 'guard',
        signatureIncludes: ['ToolGuard'],
      },
      status: 'verified',
      fallback: '不注册守卫，工具调用不再被拦',
    },
    {
      id: 'evt.agent-created',
      surface: 'event',
      ref: 'agent/created',
      code: '外部插件（按 agent 挂载 scoped 子插件）',
      why: '每个 agent 创建时注入 per-agent 行为',
      probe: {
        kind: 'event',
        event: 'agent/created',
        mode: 'serial',
        signatureIncludes: ["'agent/created'"],
      },
      status: 'verified',
      fallback: '只能对已存在的 agent 生效，新建的不受影响',
    },
    {
      id: 'svc.webServer.register',
      surface: 'service',
      ref: 'ctx.inject([\'webServer\'], cb) → webServer.register()',
      code: '外部插件（dsh-tool-keeper api.js）',
      why: '设置页的数据通道；不能写进 inject（headless 无此服务会 pending）',
      probe: {
        kind: 'service',
        service: 'webServer',
        method: 'register',
        signatureIncludes: ['WebRoute'],
      },
      status: 'verified',
      fallback: '设置页拿不到数据',
    },
    {
      id: 'slot.settings-section',
      surface: 'slot',
      ref: 'settings.section',
      code: '外部插件 ui/client.js',
      why: '设置页入口 Slot',
      probe: {
        kind: 'none',
        manual: '客户端探测常超时；需页面在线时用 Slots.listSubTree 核对',
      },
      status: 'unverified',
      fallback: '设置页不出现',
    },
  ],
}

writeFileSync(join(OUT, 'touchpoints.json'), JSON.stringify(touchpoints, null, 2) + '\n')
writeFileSync(join(OUT, 'host-snapshot.json'), JSON.stringify(snapshot, null, 2) + '\n')
console.log('written: skills/plugin-kit/assets/touchpoints.json + host-snapshot.json')
