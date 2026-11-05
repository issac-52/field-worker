package com.meter.fieldwork.global;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {
  @ExceptionHandler(ApiException.class)
  ResponseEntity<?> domain(ApiException ex) {
    return ResponseEntity.status(ex.status).body(ApiResult.error(ex.code, ex.getMessage()));
  }

  @ExceptionHandler({
    MethodArgumentNotValidException.class,
    HttpMessageNotReadableException.class,
    org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class,
    org.springframework.web.bind.MissingServletRequestParameterException.class,
    IllegalArgumentException.class
  })
  ResponseEntity<?> invalid(Exception ex) {
    return ResponseEntity.badRequest().body(ApiResult.error("INVALID_INPUT", "입력값을 확인하세요."));
  }

  @ExceptionHandler({
    DataIntegrityViolationException.class,
    ObjectOptimisticLockingFailureException.class
  })
  ResponseEntity<?> conflict(Exception ex) {
    return ResponseEntity.status(409).body(ApiResult.error("CONFLICT", "중복 또는 동시 변경이 감지되었습니다."));
  }

  @ExceptionHandler({
    org.springframework.dao.DataAccessResourceFailureException.class,
    org.springframework.transaction.CannotCreateTransactionException.class
  })
  ResponseEntity<?> databaseUnavailable(Exception ex) {
    return ResponseEntity.status(503)
        .body(ApiResult.error("DATABASE_UNAVAILABLE", "저장소 연결 실패로 처리하지 못했습니다. 다시 시도하세요."));
  }

  @ExceptionHandler(org.springframework.web.multipart.MaxUploadSizeExceededException.class)
  ResponseEntity<?> uploadTooLarge(Exception ex) {
    return ResponseEntity.status(413)
        .body(ApiResult.error("UPLOAD_TOO_LARGE", "업로드 파일 크기 제한을 초과했습니다."));
  }
}
