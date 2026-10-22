package com.meter.fieldwork.user.repository;

import com.meter.fieldwork.user.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {

    public Optional<User> findByLoginId(String loginId);

    public boolean existsByLoginId(String loginId);
}
