package com.devops.app;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(HealthController.class)
public class HealthControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    public void testGetHealth() throws Exception {
        mockMvc.perform(get("/api/health")
                .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"))
                .andExpect(jsonPath("$.database").value("CONNECTED"))
                .andExpect(jsonPath("$.version").value("1.0.0"));
    }

    @Test
    public void testGetInfo() throws Exception {
        mockMvc.perform(get("/api/info")
                .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.appName").value("DevOps Java Web App"))
                .andExpect(jsonPath("$.framework").value("Spring Boot 3.2.5"));
    }

    @Test
    public void testGetMetrics() throws Exception {
        mockMvc.perform(get("/api/metrics")
                .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.heapMemoryUsedBytes").exists())
                .andExpect(jsonPath("$.activeThreads").exists());
    }
}
