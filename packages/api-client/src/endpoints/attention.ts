import type { HttpClient } from "../http.js";
import type {
  TextAttention,
  TextAttentionRequest,
  ImageAttention,
  ImageAttentionRequest,
  AudioAttention,
  AudioAttentionRequest,
  YoutubeAttention,
  YoutubeAttentionRequest,
  ActiveTabRequest,
  ActiveTabResponse,
  LocaleRequest,
  LocaleResponse,
} from "../types/index.js";

export class AttentionEndpoint {
  constructor(private http: HttpClient) {}

  async text(data: TextAttentionRequest): Promise<TextAttention> {
    return this.http.post<TextAttention>("/attention/text", data, true);
  }

  async image(data: ImageAttentionRequest): Promise<ImageAttention> {
    return this.http.post<ImageAttention>("/attention/image", data, true);
  }

  async audio(data: AudioAttentionRequest): Promise<AudioAttention> {
    return this.http.post<AudioAttention>("/attention/audio", data, true);
  }

  async youtube(data: YoutubeAttentionRequest): Promise<YoutubeAttention> {
    return this.http.post<YoutubeAttention>("/attention/youtube", data, true);
  }

  async activeTab(data: ActiveTabRequest): Promise<ActiveTabResponse> {
    return this.http.post<ActiveTabResponse>("/attention/active-tab", data, true);
  }

  async locale(data: LocaleRequest): Promise<LocaleResponse> {
    return this.http.post<LocaleResponse>("/attention/locale", data, true);
  }
}
