export class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const notFound = (req, res, next) => {
  next(new AppError('الخدمة أو المسار المطلوب غير موجود', 404));
};

export const errorHandler = (err, req, res, next) => {
  const isProd = process.env.NODE_ENV === 'production';
  let statusCode = err.statusCode || 500;
  let message = err.message || 'حدث خطأ غير متوقع، يرجى المحاولة لاحقاً';

  // تسجيل الخطأ الكامل في سجل السيرفر (Render Logs) للمبرمج فقط
  console.error(`[ERROR] ${req.method} ${req.originalUrl}:`, {
    message: err.message,
    statusCode,
    stack: isProd ? undefined : err.stack,
  });

  // معالجة أخطاء قاعدة البيانات و JWT حتى لا تظهر بصيغة برمجية للمستخدم
  if (err.name === 'CastError') {
    statusCode = 400;
    message = 'البيانات المرسلة غير صالحة';
  } else if (err.code === 11000) {
    statusCode = 409;
    message = 'هذه البيانات مسجلة مسبقاً في النظام';
  } else if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'يرجى التأكد من إدخال جميع الحقول بشكل صحيح';
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً';
  } else if (err.type === 'entity.too.large') {
    statusCode = 413;
    message = 'حجم الملف الصوتي أو البيانات كبير جداً';
  }

  // إخفاء أي خطأ برمجي داخلي (500/502) أو رسائل مفاتيح API عن المستخدم العادي
  if (
    !err.isOperational ||
    statusCode >= 500 ||
    /groq|elevenlabs|api key|mongo|econnrefused|fetch failed/i.test(message)
  ) {
    message = 'الخدمة مشغولة حالياً أو قيد الصيانة المؤقتة، يرجى المحاولة بعد قليل';
  }

  res.status(statusCode).json({
    success: false,
    message,
    // لا يتم إرسال تفاصيل الخطأ البرمجية إلا في وضع التطوير المحلي وبشرط تفعيل SHOW_DEV_ERRORS
    ...(process.env.NODE_ENV === 'development' && process.env.SHOW_DEV_ERRORS === 'true'
      ? { devError: err.message, stack: err.stack }
      : {}),
  });
};