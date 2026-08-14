# 2026 Research & Reference Matrix

> Phase 3 audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited HEAD: `315a0760267354be46fec8a5f83ad8746badd392`

## Research method

References supply behavioral principles, not pixel-copy instructions.

### OpenAI — Codex mobile
Official May 2026:
https://openai.com/index/work-with-codex-from-anywhere/

Lesson: phone can steer/approve while files, credentials, permissions and execution remain on trusted machine.

Thryftverse: Codex Remote Host adapter and truthful runtime location.

### Apple — Foundation Models / iOS 27
https://developer.apple.com/wwdc26/guides/ios/
https://developer.apple.com/documentation/Updates/FoundationModels
https://developer.apple.com/videos/play/wwdc2026/339/

Lessons:
- native on-device model
- common LanguageModel protocol
- multimodal
- Dynamic Profiles
- tools
- local/server provider abstraction.

Thryftverse: native iOS Agent adapter.

### Android — ADK
https://developer.android.com/ai/adk

Lessons:
- agents directly inside Android apps
- local/hosted/mobile runtimes
- Gemini Nano via ML Kit GenAI.

Thryftverse: Kotlin native adapter.

### Anthropic — Managed Agents / permissions
https://platform.claude.com/docs/en/managed-agents/quickstart
https://platform.claude.com/docs/en/managed-agents/permission-policies
https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-runner

Lessons:
- reusable agent definition
- session lifecycle
- permission policies
- confirmation events
- manual loop for human approval.

### MCP 2026-07-28
https://blog.modelcontextprotocol.io/posts/2026-07-28/

Lessons:
stateless core, discoverable capabilities, cacheable lists, hardened auth, Tasks extension and formal deprecation.

### Hermes
https://github.com/NousResearch/hermes-agent
https://hermes-agent.ai/features/persistent-memory
https://hermes-agent.ai/features/subagents

Lessons:
harness-level memory, profiles, subagents and provider/runtime abstraction.

Thryftverse should connect to the harness rather than copy its terminal UX.

### Instagram Instants
https://about.fb.com/news/2026/05/instants-share-in-the-moment/

Lesson: a deliberately constrained camera-first route can feel modern because it removes editing complexity and prioritizes authentic immediacy.

### Snapchat Quick Cut
https://newsroom.snap.com/snap-quick-cut

Lesson: multi-select → immediate rendered preview → fewer editing steps.

### Snapchat Spotlight authenticity
https://newsroom.snap.com/still-spotlight-but-still-real

Lesson: original/native content and reduced synthetic-AI feel are quality signals.

### eBay Magical Listing direction
https://investors.ebayinc.com/investor-news/press-release-details/2026/eBay-Inc--Reports-Fourth-Quarter-and-Full-Year-2025-Results/default.aspx

Lesson: intelligence can generate normal structured listing fields from minimal input instead of forcing a separate AI workflow.

## Mapping

| Problem | Reference principle |
|---|---|
| “agent on phone” ambiguity | Codex remote + Apple/Android native runtime |
| unsafe tools | Anthropic approvals + MCP auth |
| provider fragmentation | adapter/protocol abstraction |
| Poster editor overload | Instants + Quick Cut |
| synthetic AI-made feel | Snapchat authenticity |
| listing intelligence chrome | eBay implicit assistance |
| persistent agent context | Hermes memory/profile pattern with strict Thryftverse privacy |
