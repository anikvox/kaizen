import { HttpClient } from "./http.js";
import { HealthEndpoint, UsersEndpoint, SSEEndpoint, DeviceTokensEndpoint, WebsiteVisitsEndpoint, AttentionEndpoint, ExportEndpoint, SettingsEndpoint, ChatsEndpoint, FocusEndpoints, QuizEndpoints, PomodoroEndpoints } from "./endpoints/index.js";
import type { ApiClientOptions } from "./types/index.js";

export class ApiClient {
  private http: HttpClient;

  public health: HealthEndpoint;
  public users: UsersEndpoint;
  public sse: SSEEndpoint;
  public deviceTokens: DeviceTokensEndpoint;
  public websiteVisits: WebsiteVisitsEndpoint;
  public attention: AttentionEndpoint;
  public export: ExportEndpoint;
  public settings: SettingsEndpoint;
  public chats: ChatsEndpoint;
  public focus: FocusEndpoints;
  public quiz: QuizEndpoints;
  public pomodoro: PomodoroEndpoints;

  constructor(options: ApiClientOptions) {
    this.http = new HttpClient(options);
    this.health = new HealthEndpoint(this.http);
    this.users = new UsersEndpoint(this.http);
    this.sse = new SSEEndpoint(this.http);
    this.deviceTokens = new DeviceTokensEndpoint(this.http);
    this.websiteVisits = new WebsiteVisitsEndpoint(this.http);
    this.attention = new AttentionEndpoint(this.http);
    this.export = new ExportEndpoint(this.http);
    this.settings = new SettingsEndpoint(this.http);
    this.chats = new ChatsEndpoint(this.http);
    this.focus = new FocusEndpoints(this.http);
    this.quiz = new QuizEndpoints(this.http);
    this.pomodoro = new PomodoroEndpoints(this.http);
  }
}

export function createApiClient(
  baseUrl: string,
  getToken?: () => Promise<string | null>
): ApiClient {
  return new ApiClient({ baseUrl, getToken });
}
