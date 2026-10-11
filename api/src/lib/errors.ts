/**
 * An error whose message is safe to show to API clients.
 * Anything that is not an HttpError is treated as an unexpected 500 and its details are hidden.
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
    this.name = new.target.name
  }
}

export class BadRequest extends HttpError {
  constructor(message = 'Bad Request') {
    super(400, message)
  }
}

export class Unauthorized extends HttpError {
  constructor(message = 'Unauthorized') {
    super(401, message)
  }
}

export class Forbidden extends HttpError {
  constructor(message = 'Forbidden') {
    super(403, message)
  }
}

export class NotFound extends HttpError {
  constructor(message = 'Not Found') {
    super(404, message)
  }
}

export class Conflict extends HttpError {
  constructor(message = 'Conflict') {
    super(409, message)
  }
}
