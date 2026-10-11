package com.inditex.similarproducts;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

/**
 * Punto de arranque del servicio agregador; la configuración HTTP queda fuera del dominio.
 */
@SpringBootApplication
@ConfigurationPropertiesScan
public class SimilarProductsApplication {

    /**
     * Arranca el contexto Spring y el servidor configurado en el puerto 5000.
     * @param args argumentos de configuración de Spring Boot
     */
    public static void main(String[] args) {
        SpringApplication.run(SimilarProductsApplication.class, args);
    }
}
