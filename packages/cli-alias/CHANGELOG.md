# @agentopia/cli

## 0.1.0

### Minor Changes

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

### Patch Changes

- Updated dependencies [[`6513161`](https://github.com/agentopiahq/agentopia/commit/6513161b17c7efd8229dd46f9858362e14187ef1), [`14e302e`](https://github.com/agentopiahq/agentopia/commit/14e302ee1d7b5f73a7f585f561073f609003e78e), [`5163679`](https://github.com/agentopiahq/agentopia/commit/5163679025d7c09abcc2f12649e2bb3543d45e0f), [`046a7f9`](https://github.com/agentopiahq/agentopia/commit/046a7f92288a0697af6f4db772d8c6ebfc144503), [`b783aee`](https://github.com/agentopiahq/agentopia/commit/b783aeee6ff4d7a59be70ae28b84a9d0de6afdaa)]:
  - agentopiahq@0.1.0
