import { GraphNode } from '@dotcomseekr/shared';

/**
 * Manages graph nodes (CRUD operations)
 */
export class NodeManager {
  private nodes: Map<string, GraphNode> = new Map();

  addNode(node: GraphNode): void {
    // TODO: Add node with deduplication
  }

  getNode(id: string): GraphNode | undefined {
    // TODO: Get node by ID
    return undefined;
  }

  normalizeValue(value: string): string {
    // TODO: Normalize node values
    return value.toLowerCase().trim();
  }
}
