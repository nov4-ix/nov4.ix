export class GitHubAPIError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public isRateLimit: boolean = false
  ) {
    super(message);
    this.name = 'GitHubAPIError';
  }
}
