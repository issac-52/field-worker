package com.meter.fieldwork.auth;

import com.meter.fieldwork.user.entity.User;
import java.util.List;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

public class SessionUser extends org.springframework.security.core.userdetails.User {
  private final Long id;
  private final long credentialVersion;

  public SessionUser(User user) {
    super(
        user.getLoginId(),
        user.getPassword(),
        user.isActive(),
        true,
        true,
        true,
        List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole().name())));
    id = user.getId();
    credentialVersion = user.getCredentialVersion();
  }

  public Long id() {
    return id;
  }

  public long credentialVersion() {
    return credentialVersion;
  }
}
