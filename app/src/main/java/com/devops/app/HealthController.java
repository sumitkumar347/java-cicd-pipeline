package com.devops.app;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.lang.management.ManagementFactory;
import java.lang.management.MemoryMXBean;
import java.lang.management.ThreadMXBean;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class HealthController {

    @GetMapping("/health")
    public Map<String, Object> getHealth() {
        Map<String, Object> response = new HashMap<>();
        response.put("status", "UP");
        response.put("database", "CONNECTED");
        response.put("timestamp", Instant.now().toString());
        response.put("version", "1.0.0");
        return response;
    }

    @GetMapping("/metrics")
    public Map<String, Object> getMetrics() {
        Map<String, Object> response = new HashMap<>();
        
        MemoryMXBean memoryMXBean = ManagementFactory.getMemoryMXBean();
        ThreadMXBean threadMXBean = ManagementFactory.getThreadMXBean();
        
        long heapUsed = memoryMXBean.getHeapMemoryUsage().getUsed();
        long heapMax = memoryMXBean.getHeapMemoryUsage().getMax();
        int activeThreads = threadMXBean.getThreadCount();
        
        response.put("heapMemoryUsedBytes", heapUsed);
        response.put("heapMemoryMaxBytes", heapMax);
        response.put("activeThreads", activeThreads);
        response.put("systemCpuLoad", ManagementFactory.getOperatingSystemMXBean().getSystemLoadAverage());
        response.put("availableProcessors", ManagementFactory.getOperatingSystemMXBean().getAvailableProcessors());
        response.put("osName", ManagementFactory.getOperatingSystemMXBean().getName());
        response.put("timestamp", Instant.now().toString());
        
        return response;
    }

    @GetMapping("/info")
    public Map<String, Object> getInfo() {
        Map<String, Object> response = new HashMap<>();
        response.put("appName", "DevOps Java Web App");
        response.put("description", "End-to-End CI/CD Pipeline Target Application");
        response.put("environment", "Production");
        response.put("owner", "DevOps Team");
        response.put("framework", "Spring Boot 3.2.5");
        response.put("javaVersion", System.getProperty("java.version"));
        return response;
    }
}
