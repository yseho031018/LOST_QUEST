package com.lostquest.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

@Entity
@Table(name = "users", uniqueConstraints = @UniqueConstraint(name = "uk_users_email", columnNames = "email"))
public class User extends BaseEntity {

    private static final String BCRYPT_PATTERN = "^\\$2[aby]\\$(0[4-9]|[12][0-9]|3[01])\\$[./A-Za-z0-9]{53}$";

    @Email
    @NotBlank
    @Size(max = 254)
    @Column(nullable = false, length = 254)
    private String email;

    /** Null for accounts created through social login, which have no password to sign in with. */
    @Pattern(regexp = BCRYPT_PATTERN, message = "비밀번호는 BCrypt 해시로 저장해야 합니다.")
    @Column(length = 60)
    private String password;

    @NotBlank
    @Size(max = 50)
    @Column(nullable = false, length = 50)
    private String nickname;

    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private UserRole role;

    protected User() {
    }

    /** Receives an already encoded BCrypt hash, never a raw password. */
    public User(String email, String passwordHash, String nickname, UserRole role) {
        if (passwordHash == null || !passwordHash.matches(BCRYPT_PATTERN)) {
            throw new IllegalArgumentException("비밀번호는 BCrypt로 암호화한 해시를 전달해야 합니다.");
        }
        this.email = email;
        this.password = passwordHash;
        this.nickname = nickname;
        this.role = role;
    }

    /** A social-login account without a password; it signs in only through its linked provider. */
    public static User withoutPassword(String email, String nickname, UserRole role) {
        User user = new User();
        user.email = email;
        user.nickname = nickname;
        user.role = role;
        return user;
    }

    @JsonIgnore
    public String getEmail() {
        return email;
    }

    @JsonIgnore
    public String getPassword() {
        return password;
    }

    @JsonIgnore
    public boolean hasPassword() {
        return password != null;
    }

    public String getNickname() {
        return nickname;
    }

    public UserRole getRole() {
        return role;
    }

    public void changeNickname(String nickname) {
        this.nickname = nickname;
    }

    /** Receives an already encoded BCrypt hash, never a raw password. */
    public void changePassword(String passwordHash) {
        if (passwordHash == null || !passwordHash.matches(BCRYPT_PATTERN)) {
            throw new IllegalArgumentException("비밀번호는 BCrypt로 암호화한 해시를 전달해야 합니다.");
        }
        this.password = passwordHash;
    }
}
