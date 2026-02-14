export interface EventSupabaseClient {
  from(table: string): {
    insert(data: unknown): Promise<{ data: unknown; error: Error | null }>;
    select(columns?: string): any;
  };
}

export interface Event {
  id: string;
  projectId: string;
  userId: string;
  eventType: string;
  payload: Record<string, unknown>;
  success: boolean;
  errorMessage?: string;
  durationMs?: number;
  createdAt: Date;
}

/**
 * Logs engine events to database
 */
export class EventLogger {
  constructor(private supabase: EventSupabaseClient) {}

  /**
   * Log an event to the events table
   */
  async logEvent(
    projectId: string,
    userId: string,
    eventType: string,
    payload: Record<string, unknown>,
    options: {
      success?: boolean;
      errorMessage?: string;
      durationMs?: number;
    } = {}
  ): Promise<void> {
    const { success = true, errorMessage, durationMs } = options;

    const { error } = await this.supabase.from('events').insert({
      project_id: projectId,
      user_id: userId,
      event_type: eventType,
      payload,
      success,
      error_message: errorMessage,
      duration_ms: durationMs,
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error('Failed to log event:', error);
      // Don't throw - logging failures shouldn't break the main flow
    }
  }

  /**
   * Retrieve events from database
   */
  async getEvents(projectId: string, eventType?: string): Promise<Event[]> {
    let query = this.supabase.from('events').select('*').eq('project_id', projectId);

    if (eventType) {
      const result = await query.eq('event_type', eventType);
      const { data, error } = result as { data: unknown; error: Error | null };

      if (error) {
        throw new Error(`Failed to retrieve events: ${error.message}`);
      }

      return this.mapEvents(data as any[]);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to retrieve events: ${error.message}`);
    }

    return this.mapEvents(data as any[]);
  }

  /**
   * Map database rows to Event objects
   */
  private mapEvents(rows: any[]): Event[] {
    return rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      userId: row.user_id,
      eventType: row.event_type,
      payload: row.payload,
      success: row.success,
      errorMessage: row.error_message,
      durationMs: row.duration_ms,
      createdAt: new Date(row.created_at),
    }));
  }
}
