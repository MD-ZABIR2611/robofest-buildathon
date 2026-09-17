'use strict';

class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function fail(status, code, message) {
  throw new AppError(status, code, message);
}

module.exports = { AppError, fail };
