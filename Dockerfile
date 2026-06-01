# =========================================================================
# Stage 1: Build the Java application using Maven
# =========================================================================
FROM maven:3.9.6-eclipse-temurin-17-alpine AS builder

WORKDIR /build

# Copy the pom.xml file to download dependencies first (caching layer)
COPY app/pom.xml .

# Download dependencies (this is cached unless pom.xml changes)
RUN mvn dependency:go-offline -B

# Copy the rest of the source code
COPY app/src ./src

# Build the application jar package, bypassing tests if needed (they run in the CI pipeline)
RUN mvn clean package -DskipTests

# =========================================================================
# Stage 2: Create the minimal production runtime image
# =========================================================================
FROM eclipse-temurin:17-jre-alpine

WORKDIR /app

# Create a system group and user to run the app securely (not as root)
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy the built jar from the builder stage
COPY --from=builder /build/target/app-1.0.0.jar app.jar

# Adjust permissions
RUN chown -R appuser:appgroup /app

# Switch to the non-root user
USER appuser

# Expose application port
EXPOSE 8080

# Environment variables with sensible defaults
ENV PORT=8080 \
    JAVA_OPTS="-XX:+UseG1GC -XX:MaxRAMPercentage=75.0"

# Healthcheck to verify service state
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:8080/api/health || exit 1

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
