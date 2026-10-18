export class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const notFound = (req, res, next) => {
  next(new AppError(`المسار غير موجود: ${req.originalUrl}`, 404));
};

export const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'حدث خطأ داخلي في الخادم';

  if (err.name === 'CastError') {
    message = 'معرّف غير صالح';
    statusCode = 400;
  }
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || '';
    message = `القيمة المدخلة في حقل (${field}) مستخدمة بالفعل`;
    statusCode = 409;
  }
  if (err.name === 'ValidationError') {
    message = Object.values(err.errors).map((v) => v.message).join('، ');
    statusCode = 400;
  }
  if (statusCode >= 500) console.error(err);

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};
