package com.meter.fieldwork.auth;

import com.meter.fieldwork.user.service.UserService;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "app.bootstrap-admin", havingValue = "true")
public class AdminInitializer implements ApplicationRunner {
  private final UserService users;
  private final Environment environment;

  public AdminInitializer(UserService users, Environment environment) {
    this.users = users;
    this.environment = environment;
  }

  @Override
  public void run(ApplicationArguments arguments) {
    if (!"none".equals(environment.getProperty("spring.main.web-application-type")))
      throw new IllegalStateException(
          "Admin initialization requires spring.main.web-application-type=none");
    users.bootstrap(
        environment.getRequiredProperty("BOOTSTRAP_ADMIN_USERNAME"),
        environment.getRequiredProperty("BOOTSTRAP_ADMIN_NAME"),
        environment.getRequiredProperty("BOOTSTRAP_ADMIN_PASSWORD"));
  }
}
