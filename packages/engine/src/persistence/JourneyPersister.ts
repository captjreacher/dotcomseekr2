/**
 * Persists expansion journey to database
 */
export class JourneyPersister {
  async saveJourney(projectId: string, journeyData: unknown): Promise<void> {
    // TODO: Save journey to database
  }

  async loadJourney(projectId: string): Promise<unknown> {
    // TODO: Load journey from database
    return null;
  }
}
