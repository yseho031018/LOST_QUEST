package com.lostquest.repository;
import com.lostquest.entity.GameScore;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.List;
public interface GameScoreRepository extends JpaRepository<GameScore, Long> {
    /** Highest score first; an equal score keeps the earlier run ahead. */
    List<GameScore> findTop10ByOrderByScoreDescIdAsc();
    /** Runs ranked above this one under the same ordering. */
    @Query("select count(g) from GameScore g where g.score > :score or (g.score = :score and g.id < :id)")
    long countAhead(@Param("score") int score, @Param("id") Long id);
}
