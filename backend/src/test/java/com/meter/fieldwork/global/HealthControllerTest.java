package com.meter.fieldwork.global;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;

class HealthControllerTest {
    @Test
    void returnsOk() {
        assertEquals("ok", new HealthController().health().get("status"));
    }
}
