import { isNonNullish } from "@fern-api/ui-core-utils";
import {
  getFrontmatter,
  isMdxJsxElementHast,
  mdastToMarkdown,
  toTree,
  visit,
} from "@fern-docs/mdx";
import { applyTemplates } from "../mdx/components/code/Template";

export function convertToLlmTxtMarkdown(
  markdown: string,
  nodeTitle: string,
  format: "mdx" | "md"
): string {
  const { title, description, content } = getLlmTxtMetadata(
    markdown,
    nodeTitle
  );
  // TODO: add link-backs to the source of the content
  // TODO: parse the markdown content and delete any unnecessary content

  return [
    `# ${title}`,
    description != null ? `> ${description}` : undefined,
    stripMdxFeatures(expandMdxComponents(content, format), format),
  ]
    .filter(isNonNullish)
    .join("\n\n");
}

/**
 * Expands custom MDX components to their semantic markdown equivalents
 * before stripping MDX features. This ensures components like TSFetchCodeBlock
 * and Template are converted to readable content for LLM consumption.
 */
function expandMdxComponents(markdown: string, format: "mdx" | "md"): string {
  if (format !== "mdx") {
    return markdown;
  }

  const { mdast } = toTree(markdown, {
    format,
    sanitize: true,
  });

  visit(mdast, (node, idx, parent) => {
    if (parent == null || idx == null) {
      return;
    }

    if (isMdxJsxElementHast(node)) {
      if (node.name === "TSFetchCodeBlock") {
        const codeContent = extractCodeFromTSFetchCodeBlock(node);
        if (codeContent) {
          const codeBlock = {
            type: "code",
            lang: "typescript",
            value: codeContent,
          };
          parent.children[idx] = codeBlock;
        }
        return;
      }

      if (node.name === "CodeGroup") {
        const codeBlocks = extractCodeFromCodeGroup(node);
        if (codeBlocks.length > 0) {
          parent.children.splice(idx, 1, ...codeBlocks);
          return idx + codeBlocks.length - 1;
        }
        return;
      }

      if (node.name === "Template") {
        const templateData = extractTemplateData(node);
        if (templateData && node.children) {
          const childrenMarkdown = mdastToMarkdown({ type: "root", children: node.children });
          const expandedContent = applyTemplates(childrenMarkdown, templateData);
          
          const { mdast: expandedMdast } = toTree(expandedContent, { format: "md", sanitize: true });
          if (expandedMdast.children) {
            parent.children.splice(idx, 1, ...expandedMdast.children);
            return idx + expandedMdast.children.length - 1;
          }
        }
        return;
      }
    }

    return;
  });

  let expandedMarkdown = mdastToMarkdown(mdast);
  
  const templateData = extractGlobalTemplateData(markdown);
  if (templateData && Object.keys(templateData).length > 0) {
    expandedMarkdown = applyTemplates(expandedMarkdown, templateData);
  }

  return expandedMarkdown;
}

/**
 * Extract code content from TSFetchCodeBlock component
 */
function extractCodeFromTSFetchCodeBlock(node: any): string | null {
  if (node.children && node.children.length > 0) {
    const codeChild = node.children.find((child: any) => child.type === "text" || child.type === "code");
    if (codeChild) {
      return codeChild.value || codeChild.children?.[0]?.value || "";
    }
  }
  
  const srcAttr = node.attributes?.find((attr: any) => attr.name === "src");
  const contentAttr = node.attributes?.find((attr: any) => attr.name === "content");
  
  if (contentAttr?.value) {
    return contentAttr.value;
  }
  
  if (srcAttr?.value) {
    return `// Code from: ${srcAttr.value}`;
  }
  
  return null;
}

/**
 * Extract code blocks from CodeGroup component
 */
function extractCodeFromCodeGroup(node: any): any[] {
  const codeBlocks: any[] = [];
  
  if (node.children) {
    node.children.forEach((child: any, index: number) => {
      if (child.type === "code" || (child.type === "element" && child.tagName === "code")) {
        codeBlocks.push({
          type: "code",
          lang: child.lang || "text",
          value: child.value || child.children?.[0]?.value || "",
        });
      } else if (isMdxJsxElementHast(child) && child.name === "Code") {
        const lang = child.attributes?.find((attr: any) => attr.name === "language")?.value || "text";
        const content = child.children?.[0]?.value || "";
        codeBlocks.push({
          type: "code",
          lang,
          value: content,
        });
      }
    });
  }
  
  return codeBlocks;
}

/**
 * Extract template data from Template component attributes
 */
function extractTemplateData(node: any): Record<string, string> | null {
  const dataAttr = node.attributes?.find((attr: any) => attr.name === "data");
  if (dataAttr?.value && typeof dataAttr.value === "object") {
    return dataAttr.value;
  }
  return null;
}

/**
 * Extract global template variables from markdown content
 * This handles common OpenRouter template variables
 */
function extractGlobalTemplateData(markdown: string): Record<string, string> {
  const templateData: Record<string, string> = {
    FREE_MODEL_CREDITS_THRESHOLD: "10", // Example value
    API_KEY_REF: "your-api-key",
    BASE_URL: "https://openrouter.ai/api/v1",
  };
  
  const { data: frontmatter } = getFrontmatter(markdown);
  if (frontmatter.templateData) {
    Object.assign(templateData, frontmatter.templateData);
  }
  
  return templateData;
}

/**
 * This is a living list of mdx features that we don't want to include in the LLM TXT format:
 * - esm imports
 * - <style> and <script> tags
 * - img tags with data: urls
 */
function stripMdxFeatures(markdown: string, format: "mdx" | "md"): string {
  if (format !== "mdx") {
    return markdown;
  }

  const { mdast } = toTree(markdown, {
    format,
    sanitize: true,
  });

  visit(mdast, (node, idx, parent) => {
    if (parent == null || idx == null) {
      return;
    }

    if (isMdxJsxElementHast(node)) {
      // remove <style> and <script> tags
      if (node.name === "style" || node.name === "script") {
        parent.children.splice(idx, 1);
        return idx;
      }

      // remove imgs and related tags that reference data: urls
      const src = node.attributes.find(
        (attr) => attr.type === "mdxJsxAttribute" && attr.name === "src"
      )?.value;
      if (typeof src === "string" && src.startsWith("data:")) {
        parent.children.splice(idx, 1);
        return idx;
      }

      node.attributes = node.attributes.filter((attr) =>
        attr.type === "mdxJsxAttribute"
          ? attr.name !== "className" && attr.name !== "style"
          : true
      );

      if (
        node.name === "div" ||
        node.name === "span" ||
        node.name === "p" ||
        node.name === "section"
      ) {
        if (node.children.length === 0) {
          parent.children.splice(idx, 1);
          return idx;
        }
      }
    }

    if (node.type === "mdxjsEsm") {
      if (node.data?.estree != null) {
        if (node.data.estree.body[0]?.type !== "ExportNamedDeclaration") {
          parent.children.splice(idx, 1);
          return idx;
        }
      }
    }

    return;
  });

  return mdastToMarkdown(mdast);
}

interface LlmTxtMetadata {
  title: string;
  description: string | undefined;
  content: string;
}

export function getLlmTxtMetadata(
  markdown: string,
  nodeTitle: string
): LlmTxtMetadata {
  const { data: frontmatter, content } = getFrontmatter(markdown);
  return {
    // TODO: parse the first h1 as the title
    title: frontmatter.title ?? nodeTitle,
    /**
     * Note: the description field in the frontmatter is expected to be the most descriptive
     * which is useful for LLM context. However, it's not always available, so we fall back
     * to other fields. But, effectively only one is selected to avoid redundancy.
     */
    description:
      frontmatter.description ??
      frontmatter["og:description"] ??
      frontmatter.subtitle ??
      frontmatter.headline ??
      frontmatter.excerpt,
    content,
  };
}
