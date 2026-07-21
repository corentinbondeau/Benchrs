const SPORTEASY_BASE_URL = "https://api.sporteasy.net/v2";

interface SportEasyEvent {
  id: number;
  name: string;
  date: string;
  end_date: string | null;
  location: string | null;
  event_type: string;
}

interface SportEasyAttendance {
  id: number;
  member_id: number;
  status: string;
  event_id: number;
}

interface SportEasyMember {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
}

export class SportEasyClient {
  private apiKey: string;
  private teamId: string;

  constructor() {
    this.apiKey = process.env.SPORTEASY_API_KEY || "";
    this.teamId = process.env.SPORTEASY_TEAM_ID || "";
  }

  private async fetch<T>(endpoint: string): Promise<T> {
    const url = `${SPORTEASY_BASE_URL}/teams/${this.teamId}${endpoint}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Token ${this.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`SportEasy API error ${res.status}: ${text}`);
    }

    return res.json();
  }

  async getEvents(): Promise<SportEasyEvent[]> {
    const data = await this.fetch<{ results: SportEasyEvent[] }>(
      "/events/?page_size=100"
    );
    return data.results;
  }

  async getEventAttendances(
    eventId: number
  ): Promise<SportEasyAttendance[]> {
    const data = await this.fetch<{
      results: SportEasyAttendance[];
    }>(`/events/${eventId}/attendances/`);
    return data.results;
  }

  async getMembers(): Promise<SportEasyMember[]> {
    const data = await this.fetch<{ results: SportEasyMember[] }>(
      "/members/?page_size=100"
    );
    return data.results;
  }
}

export const sporteasy = new SportEasyClient();
