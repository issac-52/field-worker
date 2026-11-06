package com.meter.fieldwork.user.repository;

import com.meter.fieldwork.user.entity.User;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserRepository extends JpaRepository<User, Long> {

  public Optional<User> findByLoginId(String loginId);

  public boolean existsByLoginId(String loginId);

  Optional<User> findByLoginIdIgnoreCase(String loginId);

  boolean existsByLoginIdIgnoreCase(String loginId);

  boolean existsByRole(com.meter.fieldwork.user.entity.UserRole role);

  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select u from User u where u.id = :id")
  Optional<User> lockById(@Param("id") Long id);
}
