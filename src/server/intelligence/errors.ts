export class IntelligenceConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntelligenceConfigurationError";
  }
}

export class IntelligenceRefusalError extends Error {
  constructor(message = "The model declined to analyze this source.") {
    super(message);
    this.name = "IntelligenceRefusalError";
  }
}

export class IntelligenceResponseError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "IntelligenceResponseError";
  }
}

export class EvidenceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvidenceValidationError";
  }
}
