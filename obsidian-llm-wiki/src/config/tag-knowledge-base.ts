/**
 * 标签知识库
 * 存储标签系统的规则、映射和学习到的知识
 */
export interface TagKnowledgeBaseConfig {
  // 从现有标签自动学习到的层级映射
  hierarchyMap: Record<string, string>;

  // 用户手动指定的映射规则（优先级最高）
  manualMappings: Record<string, string>;

  // 标签合并规则
  mergeRules: Array<{ from: string; to: string }>;

  // 标签格式规则
  rules: {
    maxDepth: number; // 最大层级深度
    minLength: number; // 每级最小长度
    maxLength: number; // 每级最大长度
    allowedChars: RegExp; // 允许的字符格式
    maxTagsPerFile: number; // 每个文件最多标签数
    minTagsPerFile: number; // 每个文件最少标签数
    separator: string; // 层级分隔符
  };

  // 禁用的标签（不会被自动生成）
  forbiddenTags: string[];
}

export const TAG_KNOWLEDGE_BASE: TagKnowledgeBaseConfig = {
  hierarchyMap: {
    // 初始为空，会从现有标签自动学习
  },

  manualMappings: {
    // 用户可以在这里手动指定标签映射，例如：
    // "llm": "ai/llm",
    // "rag": "ai/llm/rag",
    // "prompt-engineering": "engineering/method/prompt-engineering"
  },

  mergeRules: [
    // 可以在这里定义合并规则，例如：
    // { from: "ml", to: "machine-learning" },
    // { from: "ai", to: "artificial-intelligence" }
  ],

  rules: {
    maxDepth: 4,
    minLength: 2,
    maxLength: 30,
    allowedChars: /^[a-z0-9-]+$/, // kebab-case 格式
    maxTagsPerFile: 5,
    minTagsPerFile: 2,
    separator: "/",
  },

  forbiddenTags: ["tag", "todo", "test", "temp", "draft", "untagged"],
};

// 标签知识库更新函数
export function updateTagKnowledgeBase(
  updates: Partial<TagKnowledgeBaseConfig>
) {
  Object.assign(TAG_KNOWLEDGE_BASE, updates);
}

// 手动添加层级映射
export function addHierarchyMapping(flatTag: string, hierarchicalTag: string) {
  TAG_KNOWLEDGE_BASE.hierarchyMap[flatTag] = hierarchicalTag;
}

// 添加合并规则
export function addMergeRule(fromTag: string, toTag: string) {
  TAG_KNOWLEDGE_BASE.mergeRules.push({ from: fromTag, to: toTag });
}