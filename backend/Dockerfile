FROM eclipse-temurin:21-jdk AS build
WORKDIR /workspace
# Wrapper checksum pins the ZIP; without unzip the shell wrapper falls back to a different archive.
RUN apt-get update && apt-get install -y --no-install-recommends unzip
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
COPY src/ src/
# Image packaging follows the separately executed verify gate (Docker integration required).
RUN sed -i 's/\r$//' mvnw && chmod +x mvnw && ./mvnw -B -DskipTests package

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /workspace/target/similar-products-service-0.0.1-SNAPSHOT.jar /app/app.jar
USER 10001:10001
EXPOSE 5000
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
