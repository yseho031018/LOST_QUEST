package com.lostquest.config;

import jakarta.validation.ValidatorFactory;
import org.hibernate.cfg.AvailableSettings;
import org.springframework.boot.autoconfigure.orm.jpa.HibernatePropertiesCustomizer;
import org.springframework.boot.autoconfigure.validation.ValidationConfigurationCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;
import java.time.ZoneId;

@Configuration
public class ItemDateValidationConfig {

    @Bean
    Clock itemDateClock() {
        return Clock.system(ZoneId.of("Asia/Seoul"));
    }

    @Bean
    ValidationConfigurationCustomizer itemDateValidationClock(Clock itemDateClock) {
        // @PastOrPresent event dates follow the site's Korean calendar even on a UTC server.
        // Registration instants continue to use Instant.now() and UTC persistence.
        return configuration -> configuration.clockProvider(() -> itemDateClock);
    }

    @Bean
    HibernatePropertiesCustomizer entityValidationUsesItemDateClock(ValidatorFactory validatorFactory) {
        // Without this Hibernate validates entities on insert/update with its own factory on the JVM clock,
        // so a UTC server would reject the Korean "today" that request validation just accepted.
        return properties -> properties.put(AvailableSettings.JAKARTA_VALIDATION_FACTORY, validatorFactory);
    }
}
