// src/core/control/tool_registry.js

(function(global) {
	global.Itera = global.Itera || {};
	global.Itera.Control = global.Itera.Control || {};

	class ToolRegistry {
		constructor() {
			this.tools = new Map();
		}

		/**
		 * ツールを登録する
		 * @param {string} name - ツール名 (例: 'read_file')
		 * @param {Function} impl - 実装関数 (params, context) => Promise<Result>
		 */
		register(name, impl) {
			this.tools.set(name, {
				impl
			});
		}

		/**
		 * アクションを実行する
		 * @param {Object} action - { type, params }
		 * @param {Object} context - { vfs, ui, config ... }
		 */
		async execute(action, context) {
			const toolDef = this.tools.get(action.type);

			if (!toolDef) {
				return {
					log: `Error: Unknown tool <${action.type}>`,
					error: true
				};
			}

			try {
				// 実行
				const output = await toolDef.impl(action.params, context);
				return output;

			} catch (err) {
				console.error(`[ToolRegistry] Error executing <${action.type}>:`, err);
				return {
					log: `Error executing <${action.type}>: ${err.message}`,
					ui: `❌ Error: ${err.message}`,
					error: true
				};
			}
		}
	}

	global.Itera.Control.ToolRegistry = ToolRegistry;

})(window);