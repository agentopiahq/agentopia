# agentopiahq

## 0.1.0

### Minor Changes

- [#62](https://github.com/agentopiahq/agentopia/pull/62) [`6513161`](https://github.com/agentopiahq/agentopia/commit/6513161b17c7efd8229dd46f9858362e14187ef1) Thanks [@tuliren](https://github.com/tuliren)! - A lead that needs your permission now asks for exactly what it wants ("may I run “yarn test”?"), waits by you until you decide, and hears your answer: you nod, give a thumbs up or say so for a yes, or shake your head for a no. Its question comes down as you answer, and then it heads straight back to its desk.

- [#64](https://github.com/agentopiahq/agentopia/pull/64) [`14e302e`](https://github.com/agentopiahq/agentopia/commit/14e302ee1d7b5f73a7f585f561073f609003e78e) Thanks [@tuliren](https://github.com/tuliren)! - Every desk now shows how full its session's context is: the monitor gets messier as the context fills, from a tidy desktop to a pile of windows, sticky notes and a warning box. Click a monitor or a desk's name to see the context broken down (system prompt, tools, MCP tools, memory files, skills, your messages, replies, tool calls and results, free space). The breakdown's "watch replay" opens the session's replay, which a desk's name used to open.

- [#68](https://github.com/agentopiahq/agentopia/pull/68) [`5163679`](https://github.com/agentopiahq/agentopia/commit/5163679025d7c09abcc2f12649e2bb3543d45e0f) Thanks [@tuliren](https://github.com/tuliren)! - Draw the office in another style: the settings card has a new Style section with eight looks beside the house cartoon (colour pencil, charcoal, ukiyo-e, blueprint, chalk, neon, infrared and film negative). The office redraws at once, and your pick is remembered in this browser.

- [#50](https://github.com/agentopiahq/agentopia/pull/50) [`046a7f9`](https://github.com/agentopiahq/agentopia/commit/046a7f92288a0697af6f4db772d8c6ebfc144503) Thanks [@tuliren](https://github.com/tuliren)! - First npm release: watch your coding agents work as an office of little clones.

  **Install** (needs Node 20+ and Claude Code on your `PATH`):

  ```sh
  npm i -g agentopiahq
  ```

  Or skip the install and use `npx agentopiahq` in place of `agentopia` below. `@agentopia/cli` is an alias for the same package (`npx @agentopia/cli watch`).

  **Run**

  ```sh
  agentopia claude    # start Claude Code with the office attached; it opens in your browser
  agentopia watch     # or keep one office open for every live session
  ```

  Arguments after `agentopia claude` go straight to Claude Code, e.g. `agentopia claude --effort high`. Only sessions started through `agentopia claude` show up in the office. Run `agentopia doctor` to check the hook wiring, and `agentopia help` for every command.

- [#66](https://github.com/agentopiahq/agentopia/pull/66) [`b783aee`](https://github.com/agentopiahq/agentopia/commit/b783aeee6ff4d7a59be70ae28b84a9d0de6afdaa) Thanks [@tuliren](https://github.com/tuliren)! - The office's export key opens a menu: save a picture as before, or the last ten seconds as a looping GIF or a video (MP4). The office keeps its last ten seconds as it goes, encoded in hardware where the machine has it, so a clip is of what just happened.
